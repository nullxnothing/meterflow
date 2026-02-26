// Agent runtime — manages execution loops for funded agents
import { logger } from './logger.js';
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

async function postTweet(credentials, text) {
  if (!credentials?.accessToken) {
    log.debug('No Twitter credentials — skipping post', { text: text.slice(0, 60) });
    return { ok: true, stub: true };
  }
  try {
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.accessToken}`, // needs OAuth 1.0a signing for production
      },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || JSON.stringify(data));
    return { ok: true, tweetId: data.data?.id };
  } catch (err) {
    log.error('Twitter post failed', { err: err.message });
    return { ok: false, error: err.message };
  }
}

async function executeTweetTick(agentId) {
  const agent = await getAgent(agentId);
  if (!agent || !agent.capabilities?.tweet) return;
  if (!hasCredits(agent, 1)) return markDepleted(agentId, agent);

  try {
    const tweetText = await generateTweet(agent);
    const result = await postTweet(agent.connections?.twitter, tweetText);
    await updateAgentCredits(agentId, -1);
    await appendAgentLog(agentId, {
      type: 'tweet',
      content: `Posted: ${tweetText.slice(0, 200)}`,
      credits: -1,
      result: result.stub ? 'stub' : (result.ok ? 'posted' : 'failed'),
    });
    log.info('Tweet executed', { agentId, stub: !!result.stub });
  } catch (err) {
    log.error('Tweet tick failed', { agentId, err: err.message });
    await appendAgentLog(agentId, { type: 'error', content: `Tweet failed: ${err.message}` });
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

async function executeTradeTick(agentId) {
  const agent = await getAgent(agentId);
  if (!agent || !agent.capabilities?.trade) return;
  if (!hasCredits(agent, 2)) return markDepleted(agentId, agent);

  try {
    const decision = await executeTrade(agent);
    await updateAgentCredits(agentId, -2);
    const isPaper = !agent.connections?.tradeWallet?.privateKey || agent.connections?.tradeWallet?.mode === 'paper';
    const label = isPaper ? '[PAPER]' : '[LIVE]';
    const summary = `${label} ${decision.action.toUpperCase()} ${decision.token || 'N/A'} — ${decision.reasoning?.slice(0, 120) || ''}`;

    await appendAgentLog(agentId, {
      type: 'trade_analysis', content: summary, credits: -2,
      decision, paperTrade: isPaper,
    });
    log.info('Trade analysis executed', { agentId, action: decision.action, paper: isPaper });
  } catch (err) {
    log.error('Trade tick failed', { agentId, err: err.message });
    await appendAgentLog(agentId, { type: 'error', content: `Trade analysis failed: ${err.message}` });
  }
}

// --- Chat capability (event-driven, called externally) ----------------------

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

// --- AgentRuntime — singleton scheduler -------------------------------------

class AgentRuntime {
  constructor() {
    this.agents = new Map(); // agentId -> { intervals, lastRun, agent }
    this.running = false;
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
  }

  async stop() {
    this.running = false;
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

    const entry = { intervals: [], lastRun: {}, agent };

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

    this.agents.set(agentId, entry);
    log.info('Agent registered', { agentId, capabilities: agent.capabilities });
  }

  async unregisterAgent(agentId) {
    const entry = this.agents.get(agentId);
    if (!entry) return;
    for (const iv of entry.intervals) clearInterval(iv);
    this.agents.delete(agentId);
    log.info('Agent unregistered', { agentId });
  }

  async executeAgentTick(agentId, capability) {
    if (!this.running) return;
    try {
      if (capability === 'tweet') await executeTweetTick(agentId);
      else if (capability === 'trade') await executeTradeTick(agentId);
    } catch (err) {
      log.error('Agent tick error', { agentId, capability, err: err.message });
    }
  }
}

export const agentRuntime = new AgentRuntime();
