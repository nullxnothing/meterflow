// Agent runtime — manages execution loops for funded agents
import { logger } from './logger.js';
import { decryptConnections } from './credential-crypto.js';
import { sendErrorAlert } from './alerts.js';
import {
  getAgent, setFundedAgent, updateAgentCredits,
  listFundedActiveAgents, appendAgentLog,
} from './kv-agents.js';

const log = logger.child({ mod: 'agent-runtime' });
const PORT = process.env.PORT || 3001;
const API_BASE = `http://localhost:${PORT}`;

const TWEET_INTERVALS = {
  high:   { min: 2 * 3600_000, max: 4 * 3600_000 },
  medium: { min: 5 * 3600_000, max: 8 * 3600_000 },
  low:    { min: 12 * 3600_000, max: 24 * 3600_000 },
};
const TRADE_INTERVALS = {
  aggressive: 30 * 60_000, moderate: 2 * 3600_000, conservative: 6 * 3600_000,
};
const CHAT_POLL_INTERVAL = 30_000;
const MAX_CONSECUTIVE_FAILURES = 5;
const HEALTH_CHECK_INTERVAL = 5 * 60_000;

// --- Helpers ----------------------------------------------------------------

async function callAI(apiKey, systemPrompt, userPrompt, jsonMode = false) {
  const body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 512,
    temperature: 0.9,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const res = await fetch(`${API_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI call failed (${res.status}): ${await res.text()}`);

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? data.content ?? '';
}

function jitter(baseMs, pct = 0.2) {
  return Math.round(baseMs + baseMs * pct * (Math.random() * 2 - 1));
}

function randomInRange(min, max) {
  return Math.round(min + Math.random() * (max - min));
}

function hasCredits(agent, required) {
  return (agent.credits?.balance ?? 0) >= required;
}

async function markDepleted(agentId, agent) {
  log.warn('Agent credit depleted', { agentId });
  agent.status = 'depleted';
  await setFundedAgent(agentId, agent);
  await appendAgentLog(agentId, { type: 'credit_depleted', content: 'Agent paused — no credits' });
}

// --- Tweet capability -------------------------------------------------------

export async function generateTweet(agent) {
  const cfg = agent.tweetConfig;
  const systemPrompt = [
    `You are an AI agent managing the Twitter account for ${agent.name} ($${agent.symbol}).`,
    `Your personality: ${cfg.personality}`,
    cfg.systemPrompt ? `Custom instructions: ${cfg.systemPrompt}` : '',
    `\nContext about the token:\n- Name: ${agent.name}\n- Symbol: ${agent.symbol}\n- Description: ${agent.description}`,
  ].filter(Boolean).join('\n');

  const topicHint = cfg.topics?.length ? `Focus on these topics: ${cfg.topics.join(', ')}` : '';
  const userPrompt = [
    'Generate a single tweet (max 280 chars). Be authentic, not robotic.',
    'Do not use hashtags excessively. Match the personality style.',
    topicHint,
    'Reply with ONLY the tweet text, nothing else.',
  ].filter(Boolean).join('\n');

  return callAI(agent.apiKey, systemPrompt, userPrompt);
}

async function postTweet(agentId, credentials, text) {
  // Try OAuth2 user token first (from platform OAuth flow), then BYOK, then raw credentials
  let token = null;

  // Check if agent's deployer has connected Twitter via OAuth
  if (credentials?.oauthApiKey) {
    try {
      const { ensureValidTwitterToken } = await import('../oauth/routes.js');
      token = await ensureValidTwitterToken(credentials.oauthApiKey);
    } catch (e) {
      log.debug('OAuth token lookup failed', { agentId, err: e.message });
    }
  }

  // Fallback to direct bearer/access token
  if (!token) token = credentials?.accessToken || credentials?.bearerToken;

  if (!token) {
    log.debug('No Twitter credentials — skipping post', { agentId, text: text.slice(0, 60) });
    return { ok: true, stub: true };
  }

  try {
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || data?.title || JSON.stringify(data));
    return { ok: true, tweetId: data.data?.id };
  } catch (err) {
    log.error('Twitter post failed', { agentId, err: err.message });
    return { ok: false, error: err.message };
  }
}

async function executeTweetTick(agentId) {
  const agent = await getAgent(agentId);
  if (!agent || !agent.capabilities?.tweet) return;
  if (!hasCredits(agent, 1)) return markDepleted(agentId, agent);

  try {
    const tweetText = await generateTweet(agent);
    const connections = decryptConnections(agent.connections || {}, agentId);
    const twitterCreds = {
      ...connections.twitter,
      oauthApiKey: agent.apiKey,
    };
    const result = await postTweet(agentId, twitterCreds, tweetText);
    await updateAgentCredits(agentId, -1);
    await appendAgentLog(agentId, {
      type: 'tweet',
      content: `Posted: ${tweetText.slice(0, 200)}`,
      credits: -1,
      result: result.stub ? 'stub' : (result.ok ? 'posted' : 'failed'),
      tweetId: result.tweetId || null,
    });
    log.info('Tweet executed', { agentId, stub: !!result.stub, ok: result.ok });
    return result.ok;
  } catch (err) {
    log.error('Tweet tick failed', { agentId, err: err.message });
    await appendAgentLog(agentId, { type: 'error', content: `Tweet failed: ${err.message}` });
    return false;
  }
}

// --- Trade capability -------------------------------------------------------

export async function executeTrade(agent) {
  const cfg = agent.tradeConfig;
  const systemPrompt = [
    `You are an AI trading analyst for ${agent.name} ($${agent.symbol}).`,
    `Strategy: ${cfg.strategy}. Max position: ${cfg.maxPositionSol} SOL.`,
    `Pairs: ${cfg.pairs?.join(', ') || 'SOL/USDC'}`,
    cfg.systemPrompt ? `Custom instructions: ${cfg.systemPrompt}` : '',
    'Analyze current conditions and provide a trading recommendation.',
  ].filter(Boolean).join('\n');

  const userPrompt = [
    'Evaluate current market conditions for the configured pairs.',
    'Respond with JSON: { "action": "buy"|"sell"|"hold", "token": "...", "amount": <number>, "reasoning": "..." }',
    'Be conservative with sizing. If uncertain, recommend hold.',
  ].join('\n');

  const raw = await callAI(agent.apiKey, systemPrompt, userPrompt, true);
  try { return JSON.parse(raw); }
  catch { return { action: 'hold', token: '', amount: 0, reasoning: raw }; }
}

async function executeTradeOnChain(agent, decision, connections) {
  if (decision.action === 'hold' || !decision.token || !decision.amount) return null;

  const walletConfig = connections?.tradeWallet;
  if (!walletConfig?.privateKey) return null;

  try {
    const { solanaConnection } = await import('../config.js');
    const { loadKeypair, getEncryptionKey } = await import('../trading/wallet.js');
    const { executePumpTrade } = await import('../trading/pumpfun.js');
    const { createSafetyManager } = await import('../trading/safety.js');

    const encKey = getEncryptionKey(
      (await import('../config.js')).CONFIG.WALLET_ENCRYPTION_SECRET,
      agent.apiKey
    );
    const keypair = loadKeypair(walletConfig.privateKey, encKey);

    // Safety check
    const safety = createSafetyManager({
      maxOrderSizeSol: agent.tradeConfig?.maxPositionSol || 1,
      maxTotalExposureSol: (agent.tradeConfig?.maxPositionSol || 1) * 3,
    });

    const validation = safety.validateTrade({
      action: decision.action,
      solAmount: decision.amount,
      mint: decision.token,
    });

    if (!validation.allowed) {
      return { executed: false, reason: validation.reason };
    }

    const result = await executePumpTrade(solanaConnection, keypair, {
      mint: decision.token,
      action: decision.action,
      amount: decision.amount,
      denominatedInSol: true,
      slippage: 15,
      priorityFee: 0.005,
      pool: 'auto',
    });

    safety.destroy();
    return { executed: true, signature: result.signature, ...result };
  } catch (err) {
    log.error('On-chain trade execution failed', { agentId: agent.id, err: err.message });
    return { executed: false, error: err.message };
  }
}

async function executeTradeTick(agentId) {
  const agent = await getAgent(agentId);
  if (!agent || !agent.capabilities?.trade) return;
  if (!hasCredits(agent, 2)) return markDepleted(agentId, agent);

  try {
    const decision = await executeTrade(agent);
    await updateAgentCredits(agentId, -2);

    const connections = decryptConnections(agent.connections || {}, agentId);
    const isPaper = !connections?.tradeWallet?.privateKey || connections?.tradeWallet?.mode === 'paper';

    let tradeResult = null;
    if (!isPaper && decision.action !== 'hold') {
      tradeResult = await executeTradeOnChain(agent, decision, connections);
    }

    const label = isPaper ? '[PAPER]' : (tradeResult?.executed ? '[LIVE]' : '[SKIPPED]');
    const summary = `${label} ${decision.action.toUpperCase()} ${decision.token || 'N/A'} — ${decision.reasoning?.slice(0, 120) || ''}`;

    await appendAgentLog(agentId, {
      type: 'trade_analysis', content: summary, credits: -2,
      decision, paperTrade: isPaper,
      execution: tradeResult,
    });
    log.info('Trade analysis executed', { agentId, action: decision.action, paper: isPaper, executed: tradeResult?.executed });
    return true;
  } catch (err) {
    log.error('Trade tick failed', { agentId, err: err.message });
    await appendAgentLog(agentId, { type: 'error', content: `Trade analysis failed: ${err.message}` });
    return false;
  }
}

// --- Chat capability (event-driven + polling) --------------------------------

export async function generateChatResponse(agent, messageContext) {
  const cfg = agent.chatConfig;
  const systemPrompt = [
    `You are ${agent.name} ($${agent.symbol}), an AI agent on ${cfg.platform}.`,
    `Personality: ${cfg.personality}`,
    cfg.systemPrompt ? `Custom instructions: ${cfg.systemPrompt}` : '',
    `Description: ${agent.description}`,
    'Be conversational and in-character. Keep responses concise.',
  ].filter(Boolean).join('\n');
  return callAI(agent.apiKey, systemPrompt, messageContext);
}

export async function handleChatMessage(agentId, message) {
  const agent = await getAgent(agentId);
  if (!agent || !agent.capabilities?.chat) return null;
  if (!hasCredits(agent, 1)) { await markDepleted(agentId, agent); return null; }

  const cfg = agent.chatConfig;
  if (cfg.respondTo === 'mentions' && !message.isMention) return null;

  try {
    const response = await generateChatResponse(agent, message.content);
    await updateAgentCredits(agentId, -1);
    await appendAgentLog(agentId, {
      type: 'chat_response',
      content: `Replied to ${message.author || 'user'}: ${response.slice(0, 200)}`,
      credits: -1, platform: cfg.platform,
    });
    log.info('Chat response generated', { agentId, platform: cfg.platform });
    return response;
  } catch (err) {
    log.error('Chat response failed', { agentId, err: err.message });
    await appendAgentLog(agentId, { type: 'error', content: `Chat failed: ${err.message}` });
    return null;
  }
}

// --- Discord bot integration (REST-based, no discord.js needed) -------------

async function pollDiscordMessages(agentId) {
  const agent = await getAgent(agentId);
  if (!agent || !agent.capabilities?.chat) return;

  const connections = decryptConnections(agent.connections || {}, agentId);
  const botToken = connections?.discord?.botToken;
  const channelIds = connections?.discord?.channelIds || [];
  if (!botToken || !channelIds.length) return;

  for (const channelId of channelIds) {
    try {
      // Get bot user ID
      const meRes = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bot ${botToken}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!meRes.ok) continue;
      const botUser = await meRes.json();

      // Fetch recent messages
      const msgRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=10`, {
        headers: { Authorization: `Bot ${botToken}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!msgRes.ok) continue;
      const messages = await msgRes.json();

      for (const msg of messages) {
        if (msg.author.id === botUser.id) continue; // skip own messages
        if (Date.now() - new Date(msg.timestamp).getTime() > CHAT_POLL_INTERVAL * 2) continue; // only recent

        const isMention = msg.mentions?.some(m => m.id === botUser.id) || msg.content.includes(`<@${botUser.id}>`);
        const cfg = agent.chatConfig;
        if (cfg.respondTo === 'mentions' && !isMention) continue;

        const response = await handleChatMessage(agentId, {
          content: msg.content,
          author: msg.author.username,
          isMention,
          platform: 'discord',
        });

        if (response) {
          await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
              Authorization: `Bot ${botToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              content: response.slice(0, 2000),
              message_reference: { message_id: msg.id },
            }),
            signal: AbortSignal.timeout(8000),
          });
        }
      }
    } catch (err) {
      log.error('Discord poll failed', { agentId, channelId, err: err.message });
    }
  }
}

// --- Telegram bot integration (REST-based polling) --------------------------

const telegramOffsets = new Map(); // agentId -> lastUpdateId

async function pollTelegramMessages(agentId) {
  const agent = await getAgent(agentId);
  if (!agent || !agent.capabilities?.chat) return;

  const connections = decryptConnections(agent.connections || {}, agentId);
  const botToken = connections?.telegram?.botToken;
  if (!botToken) return;

  try {
    const offset = telegramOffsets.get(agentId) || 0;
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset + 1}&timeout=1&allowed_updates=["message"]`,
      { signal: AbortSignal.timeout(10_000) }
    );
    const data = await res.json();
    if (!data.ok || !data.result?.length) return;

    const chatIds = new Set(connections.telegram?.chatIds?.map(String) || []);

    for (const update of data.result) {
      telegramOffsets.set(agentId, update.update_id);
      const msg = update.message;
      if (!msg?.text) continue;

      // Only respond in configured chats (or all if none configured)
      if (chatIds.size > 0 && !chatIds.has(String(msg.chat.id))) continue;

      const botInfo = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, { signal: AbortSignal.timeout(5000) });
      const botData = await botInfo.json();
      const botUsername = botData.result?.username || '';
      const isMention = msg.text.includes(`@${botUsername}`) || msg.chat.type === 'private';

      const cfg = agent.chatConfig;
      if (cfg.respondTo === 'mentions' && !isMention) continue;

      const response = await handleChatMessage(agentId, {
        content: msg.text,
        author: msg.from?.username || msg.from?.first_name || 'user',
        isMention,
        platform: 'telegram',
      });

      if (response) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: msg.chat.id,
            text: response.slice(0, 4096),
            reply_to_message_id: msg.message_id,
          }),
          signal: AbortSignal.timeout(8000),
        });
      }
    }
  } catch (err) {
    log.error('Telegram poll failed', { agentId, err: err.message });
  }
}

// --- AgentRuntime — singleton scheduler + monitoring -------------------------

class AgentRuntime {
  constructor() {
    this.agents = new Map(); // agentId -> { intervals, lastRun, agent, failures }
    this.running = false;
    this.healthCheckTimer = null;
  }

  async start() {
    if (process.env.AGENT_RUNTIME_ENABLED !== 'true') {
      log.info('Agent runtime disabled (set AGENT_RUNTIME_ENABLED=true to enable)');
      return;
    }
    this.running = true;
    log.info('Agent runtime starting');
    try {
      const agents = await listFundedActiveAgents();
      log.info(`Loaded ${agents.length} active agents`);
      for (const agent of agents) await this.registerAgent(agent.id);
    } catch (err) {
      log.error('Failed to bootstrap agent runtime', { err: err.message });
    }

    // Start health check loop
    this.healthCheckTimer = setInterval(() => this.runHealthChecks(), HEALTH_CHECK_INTERVAL);
  }

  async stop() {
    this.running = false;
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    for (const [id, entry] of this.agents) {
      for (const iv of entry.intervals) clearInterval(iv);
    }
    this.agents.clear();
    log.info('Agent runtime stopped');
  }

  async registerAgent(agentId) {
    if (this.agents.has(agentId)) return;
    const agent = await getAgent(agentId);
    if (!agent || agent.status !== 'active') return;

    const entry = { intervals: [], lastRun: {}, agent, failures: {} };

    if (agent.capabilities?.tweet && agent.tweetConfig) {
      const range = TWEET_INTERVALS[agent.tweetConfig.frequency] || TWEET_INTERVALS.medium;
      const ms = jitter(randomInRange(range.min, range.max));
      entry.intervals.push(setInterval(() => this.executeAgentTick(agentId, 'tweet'), ms));
      log.debug('Scheduled tweets', { agentId, intervalMs: ms });
    }

    if (agent.capabilities?.trade && agent.tradeConfig) {
      const baseMs = TRADE_INTERVALS[agent.tradeConfig.strategy] || TRADE_INTERVALS.moderate;
      const ms = jitter(baseMs);
      entry.intervals.push(setInterval(() => this.executeAgentTick(agentId, 'trade'), ms));
      log.debug('Scheduled trades', { agentId, intervalMs: ms });
    }

    if (agent.capabilities?.chat) {
      const platform = agent.chatConfig?.platform || 'discord';
      if (platform === 'discord' || platform === 'both') {
        entry.intervals.push(setInterval(() => pollDiscordMessages(agentId), CHAT_POLL_INTERVAL));
        log.debug('Scheduled Discord polling', { agentId });
      }
      if (platform === 'telegram' || platform === 'both') {
        entry.intervals.push(setInterval(() => pollTelegramMessages(agentId), CHAT_POLL_INTERVAL));
        log.debug('Scheduled Telegram polling', { agentId });
      }
    }

    this.agents.set(agentId, entry);
    log.info('Agent registered', { agentId, capabilities: agent.capabilities });
  }

  async unregisterAgent(agentId) {
    const entry = this.agents.get(agentId);
    if (!entry) return;
    for (const iv of entry.intervals) clearInterval(iv);
    this.agents.delete(agentId);
    telegramOffsets.delete(agentId);
    log.info('Agent unregistered', { agentId });
  }

  async executeAgentTick(agentId, capability) {
    if (!this.running) return;
    const entry = this.agents.get(agentId);
    if (!entry) return;

    try {
      let success = false;
      if (capability === 'tweet') success = await executeTweetTick(agentId);
      else if (capability === 'trade') success = await executeTradeTick(agentId);

      entry.lastRun[capability] = Date.now();

      // Track consecutive failures for monitoring
      if (success === false) {
        entry.failures[capability] = (entry.failures[capability] || 0) + 1;
      } else {
        entry.failures[capability] = 0;
      }
    } catch (err) {
      log.error('Agent tick error', { agentId, capability, err: err.message });
      if (entry) {
        entry.failures[capability] = (entry.failures[capability] || 0) + 1;
      }
    }
  }

  async runHealthChecks() {
    if (!this.running) return;

    for (const [agentId, entry] of this.agents) {
      // Check for consecutive failures
      for (const [capability, failCount] of Object.entries(entry.failures)) {
        if (failCount >= MAX_CONSECUTIVE_FAILURES) {
          const agent = await getAgent(agentId);
          const name = agent?.name || agentId;

          log.error('Agent capability failing repeatedly', { agentId, capability, failCount });
          await appendAgentLog(agentId, {
            type: 'error',
            content: `${capability} has failed ${failCount} times consecutively — pausing capability`,
          });

          sendErrorAlert({
            title: `Agent ${name} failing: ${capability}`,
            message: `${capability} has failed ${failCount} consecutive times for agent ${name} (${agentId}).`,
            endpoint: `agent-runtime/${capability}`,
            statusCode: 500,
          });

          // Reset counter to avoid repeated alerts
          entry.failures[capability] = 0;
        }
      }

      // Check if agent was paused/depleted externally
      const agent = await getAgent(agentId);
      if (!agent || agent.status !== 'active') {
        log.info('Agent no longer active, unregistering', { agentId, status: agent?.status });
        await this.unregisterAgent(agentId);
      }
    }
  }
}

export const agentRuntime = new AgentRuntime();
