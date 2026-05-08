// Funded Agent Launch — token creation + agent provisioning
import crypto from 'crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateApiKey } from '../middleware.js';
import { CONFIG, solanaConnection } from '../config.js';
import { logger } from '../lib/logger.js';
import { encryptConnections, decryptConnections } from '../lib/credential-crypto.js';
import {
  getAgent,
  setFundedAgent,
  getFundedAgentsByWallet,
  addFundedAgentToWallet,
  setFundedAgentToken,
  pauseFundedAgent,
  activateFundedAgent,
  getAgentLogs,
  updateAgentCredits,
} from '../lib/kv-agents.js';

const router = Router();
const log = logger.child({ mod: 'launch' });
const PUMPPORTAL_API = 'https://pumpportal.fun/api/trade-local';
const PUMP_IPFS = 'https://pump.fun/api/ipfs';
const TREASURY_WALLET = CONFIG.TREASURY_WALLET;

// Rate limiter: 3 agent creations per hour per wallet
const launchLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => req.meterflow?.wallet || req.ip,
  message: { error: 'rate_limited', message: 'Max 3 agent launches per hour. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const VALID_POOLS = ['pump', 'raydium', 'pump-amm', 'launchlab', 'raydium-cpmm', 'bonk', 'auto'];
const VALID_FREQUENCIES = ['high', 'medium', 'low'];
const VALID_STRATEGIES = ['conservative', 'moderate', 'aggressive'];
const VALID_PLATFORMS = ['discord', 'telegram', 'both'];
const VALID_RESPOND_TO = ['mentions', 'all'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateAgentId() {
  return 'agt_' + crypto.randomBytes(8).toString('hex');
}

/** Parse a field that may arrive as JSON string or object (multipart vs json body) */
function parseJsonField(val) {
  if (!val) return undefined;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return undefined; }
}

/** Convert a base64 data URL to a Blob suitable for FormData */
function dataUrlToBlob(dataUrl) {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/s);
  if (!match) return null;
  const mime = match[1];
  const buf = Buffer.from(match[2], 'base64');
  return new Blob([buf], { type: mime });
}

/** Determine file extension from mime type */
function extFromMime(mime) {
  if (mime.includes('png')) return 'png';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('svg')) return 'svg';
  return 'jpg';
}

// Fields that should be fully masked (show last 4 only)
const FULL_MASK_FIELDS = new Set(['botToken', 'accessToken', 'accessTokenSecret', 'privateKey']);
// Fields that should be partially masked (show first 3 + last 4)
const PARTIAL_MASK_FIELDS = new Set(['apiKey', 'apiSecret']);

/** Mask a single credential string */
function maskValue(key, val) {
  if (typeof val !== 'string' || val.length < 5) return '****';
  if (FULL_MASK_FIELDS.has(key)) return `****...${val.slice(-4)}`;
  if (PARTIAL_MASK_FIELDS.has(key)) return `${val.slice(0, 3)}...${val.slice(-4)}`;
  return val;
}

/** Deep-clone an agent and mask all sensitive credential fields before returning */
function maskCredentials(agent) {
  if (!agent) return agent;
  const clone = JSON.parse(JSON.stringify(agent));

  // Mask the deployer's API key
  if (clone.apiKey) clone.apiKey = `${clone.apiKey.slice(0, 6)}...${clone.apiKey.slice(-4)}`;

  if (!clone.connections) return clone;

  for (const [platform, config] of Object.entries(clone.connections)) {
    if (!config || typeof config !== 'object') continue;
    for (const [field, value] of Object.entries(config)) {
      if (FULL_MASK_FIELDS.has(field) || PARTIAL_MASK_FIELDS.has(field)) {
        config[field] = maskValue(field, value);
      }
    }
  }
  return clone;
}

/** Build the full agent config object */
function buildAgentConfig({ id, wallet, apiKey, name, symbol, description, imageUrl, capabilities, tweetConfig, tradeConfig, chatConfig, connections, metadataUri, tokenMetadata }) {
  return {
    id,
    wallet,
    apiKey: apiKey || null, // deployer's API key for runtime AI calls
    tokenMint: null, // set after on-chain confirmation
    name,
    symbol,
    description: description || `Funded agent launched via Meterflow.`,
    imageUrl: imageUrl || null,
    connections: connections || {},
    capabilities: {
      tweet: !!capabilities?.tweet,
      trade: !!capabilities?.trade,
      chat: !!capabilities?.chat,
    },
    tweetConfig: capabilities?.tweet ? {
      personality: tweetConfig?.personality || 'community builder',
      topics: Array.isArray(tweetConfig?.topics) ? tweetConfig.topics : [],
      frequency: VALID_FREQUENCIES.includes(tweetConfig?.frequency) ? tweetConfig.frequency : 'medium',
    } : null,
    tradeConfig: capabilities?.trade ? {
      strategy: VALID_STRATEGIES.includes(tradeConfig?.strategy) ? tradeConfig.strategy : 'moderate',
      maxPositionSol: Number(tradeConfig?.maxPositionSol) || 1,
      pairs: Array.isArray(tradeConfig?.pairs) ? tradeConfig.pairs : ['SOL/USDC'],
    } : null,
    chatConfig: capabilities?.chat ? {
      platform: VALID_PLATFORMS.includes(chatConfig?.platform) ? chatConfig.platform : 'discord',
      personality: chatConfig?.personality || 'helpful assistant',
      respondTo: VALID_RESPOND_TO.includes(chatConfig?.respondTo) ? chatConfig.respondTo : 'mentions',
    } : null,
    feeSplit: { treasury: 70, agent: 30 },
    credits: { balance: 0, totalEarned: 0, totalSpent: 0 },
    status: 'pending',
    createdAt: new Date().toISOString(),
    tokenMetadata: tokenMetadata || null,
    metadataUri: metadataUri || null,
  };
}

// ---------------------------------------------------------------------------
// POST /v1/launch/create — Create a funded agent + upload metadata
// ---------------------------------------------------------------------------
router.post('/launch/create', authenticateApiKey, launchLimiter, async (req, res) => {
  const {
    name, symbol, description,
    twitter, telegram, website,
    image, imageUrl,
    devBuySol = 0, pool = 'pump',
  } = req.body;

  const capabilities = parseJsonField(req.body.capabilities);
  const tweetConfig = parseJsonField(req.body.tweetConfig);
  const tradeConfig = parseJsonField(req.body.tradeConfig);
  const chatConfig = parseJsonField(req.body.chatConfig);

  // Validation
  if (!name || !symbol) {
    return res.status(400).json({ error: 'name and symbol required' });
  }
  if (name.length > 32) {
    return res.status(400).json({ error: 'name too long (max 32)' });
  }
  if (symbol.length > 10) {
    return res.status(400).json({ error: 'symbol too long (max 10)' });
  }
  if (!VALID_POOLS.includes(pool)) {
    return res.status(400).json({ error: `invalid pool, must be one of: ${VALID_POOLS.join(', ')}` });
  }

  const wallet = req.meterflow?.wallet;
  if (!wallet) {
    return res.status(400).json({ error: 'wallet not found on API key — reconnect your wallet' });
  }

  try {
    // Step 1: Build IPFS form data
    const formData = new FormData();
    formData.append('name', name);
    formData.append('symbol', symbol);
    formData.append('description', description || `Funded agent launched via Meterflow. Agent revenue can fund AI operations.`);
    if (twitter) formData.append('twitter', twitter);
    if (telegram) formData.append('telegram', telegram);
    if (website) formData.append('website', website);
    formData.append('showName', 'true');

    // Step 2: Handle image upload
    let resolvedImageUrl = null;

    if (image && typeof image === 'string' && image.startsWith('data:')) {
      // Base64 data URL from frontend drag-and-drop
      const blob = dataUrlToBlob(image);
      if (blob) {
        const ext = extFromMime(blob.type);
        formData.append('file', blob, `agent.${ext}`);
        resolvedImageUrl = '(uploaded)';
      }
    } else if (imageUrl) {
      // Remote URL — fetch and attach
      try {
        const imgRes = await fetch(imageUrl);
        if (imgRes.ok) {
          const imgBlob = await imgRes.blob();
          formData.append('file', imgBlob, 'agent.png');
          resolvedImageUrl = imageUrl;
        }
      } catch (e) {
        log.warn('Failed to fetch imageUrl, continuing without image', { imageUrl, err: e.message });
      }
    }

    // Step 3: Upload to pump.fun IPFS
    const ipfsRes = await fetch(PUMP_IPFS, { method: 'POST', body: formData });
    if (!ipfsRes.ok) {
      const errText = await ipfsRes.text();
      throw new Error(`IPFS upload failed: ${errText}`);
    }
    const ipfsData = await ipfsRes.json();

    // Step 4: Generate agent ID and build config
    const agentId = generateAgentId();
    const tokenMetadata = { name, symbol, uri: ipfsData.metadataUri };

    // Store connections and deployer's API key for the runtime
    const connections = parseJsonField(req.body.connections) || {};

    const agentConfig = buildAgentConfig({
      id: agentId,
      wallet,
      apiKey: req.meterflow?.apiKey,
      name,
      symbol,
      description,
      imageUrl: ipfsData.metadataUri ? resolvedImageUrl : null,
      capabilities,
      tweetConfig,
      tradeConfig,
      chatConfig,
      connections,
      metadataUri: ipfsData.metadataUri,
      tokenMetadata,
    });

    // Step 5: Encrypt credentials and persist agent
    agentConfig.connections = encryptConnections(agentConfig.connections, agentId);
    await setFundedAgent(agentId, agentConfig);
    await addFundedAgentToWallet(wallet, agentId);

    log.info('Funded agent created', { agentId, wallet, name, symbol });

    // Step 6: Build PumpPortal transaction for client-side signing
    let launchTx = null;
    try {
      const pumpRes = await fetch(PUMPPORTAL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: wallet,
          action: 'create',
          tokenMetadata,
          mint: req.body.mintPublicKey || undefined,
          denominatedInSol: 'true',
          amount: devBuySol || 0,
          slippage: 10,
          priorityFee: 0.0005,
          pool,
        }),
      });
      if (pumpRes.ok) {
        const txBytes = new Uint8Array(await pumpRes.arrayBuffer());
        launchTx = Buffer.from(txBytes).toString('base64');
      } else {
        log.warn('PumpPortal tx build failed', { status: pumpRes.status, body: await pumpRes.text() });
      }
    } catch (e) {
      log.warn('PumpPortal tx build error', { err: e.message });
    }

    res.json({
      ok: true,
      agent: maskCredentials(agentConfig),
      agentId,
      metadataUri: ipfsData.metadataUri,
      tokenMetadata,
      treasury: TREASURY_WALLET,
      launchTx,
      launchConfig: {
        action: 'create',
        tokenMetadata,
        denominatedInSol: 'true',
        amount: devBuySol || 0,
        slippage: 10,
        priorityFee: 0.0005,
        pool,
      },
    });
  } catch (err) {
    log.error('Agent launch failed', { name, symbol, err: err.message });
    res.status(502).json({ error: 'launch_failed', message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/launch/info — Public launch platform info
// ---------------------------------------------------------------------------
router.get('/launch/info', async (_req, res) => {
  res.json({
    treasury: TREASURY_WALLET,
    feeModel: 'Creator fees are split 70/30 — treasury funds platform AI, 30% powers your agent.',
    feeSplit: { treasury: 70, agent: 30 },
    supported: VALID_POOLS,
    capabilities: ['tweet', 'trade', 'chat'],
    howItWorks: [
      'Configure your AI agent capabilities (tweet, trade, chat)',
      'Launch a token via pump.fun with the agent linked',
      'Creator fees are split: 70% to Meterflow treasury, 30% funds your agent',
      'Your agent uses its credit balance to operate autonomously',
      'More trading volume = more agent credits = more powerful agent',
    ],
  });
});

// ---------------------------------------------------------------------------
// GET /v1/launch/agents — List all agents for the authenticated wallet
// ---------------------------------------------------------------------------
router.get('/launch/agents', authenticateApiKey, async (req, res) => {
  const wallet = req.meterflow?.wallet;
  if (!wallet) {
    return res.status(400).json({ error: 'wallet not found on API key' });
  }

  try {
    const agentIds = await getFundedAgentsByWallet(wallet);
    const agents = [];

    for (const id of agentIds) {
      const agent = await getAgent(id);
      if (agent) agents.push(agent);
    }

    res.json({ ok: true, agents: agents.map(maskCredentials) });
  } catch (err) {
    log.error('Failed to list agents', { wallet, err: err.message });
    res.status(500).json({ error: 'internal', message: 'Failed to fetch agents' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/launch/agent/:id — Get a single agent's full config
// ---------------------------------------------------------------------------
router.get('/launch/agent/:id', authenticateApiKey, async (req, res) => {
  const { id } = req.params;
  const wallet = req.meterflow?.wallet;

  try {
    const agent = await getAgent(id);
    if (!agent) {
      return res.status(404).json({ error: 'agent_not_found' });
    }
    if (agent.wallet !== wallet) {
      return res.status(403).json({ error: 'not_owner', message: 'You do not own this agent' });
    }

    res.json({ ok: true, agent: maskCredentials(agent) });
  } catch (err) {
    log.error('Failed to get agent', { agentId: id, err: err.message });
    res.status(500).json({ error: 'internal', message: 'Failed to fetch agent' });
  }
});

// ---------------------------------------------------------------------------
// POST /v1/launch/agent/:id/pause — Pause an agent
// ---------------------------------------------------------------------------
router.post('/launch/agent/:id/pause', authenticateApiKey, async (req, res) => {
  const { id } = req.params;
  const wallet = req.meterflow?.wallet;

  try {
    const agent = await getAgent(id);
    if (!agent) {
      return res.status(404).json({ error: 'agent_not_found' });
    }
    if (agent.wallet !== wallet) {
      return res.status(403).json({ error: 'not_owner', message: 'You do not own this agent' });
    }
    if (agent.status === 'paused') {
      return res.json({ ok: true, agent, message: 'Agent is already paused' });
    }
    if (agent.status !== 'active') {
      return res.status(409).json({ error: 'invalid_state', message: `Cannot pause agent with status "${agent.status}"` });
    }

    const updated = await pauseFundedAgent(id);
    log.info('Agent paused', { agentId: id, wallet });
    res.json({ ok: true, agent: updated });
  } catch (err) {
    log.error('Failed to pause agent', { agentId: id, err: err.message });
    res.status(500).json({ error: 'internal', message: 'Failed to pause agent' });
  }
});

// ---------------------------------------------------------------------------
// POST /v1/launch/agent/:id/resume — Resume a paused agent
// ---------------------------------------------------------------------------
router.post('/launch/agent/:id/resume', authenticateApiKey, async (req, res) => {
  const { id } = req.params;
  const wallet = req.meterflow?.wallet;

  try {
    const agent = await getAgent(id);
    if (!agent) {
      return res.status(404).json({ error: 'agent_not_found' });
    }
    if (agent.wallet !== wallet) {
      return res.status(403).json({ error: 'not_owner', message: 'You do not own this agent' });
    }
    if (agent.status === 'active') {
      return res.json({ ok: true, agent, message: 'Agent is already active' });
    }
    if (agent.status === 'depleted') {
      return res.status(409).json({ error: 'depleted', message: 'Agent has no credits. Fund it before resuming.' });
    }
    if (agent.status !== 'paused') {
      return res.status(409).json({ error: 'invalid_state', message: `Cannot resume agent with status "${agent.status}"` });
    }

    const updated = await activateFundedAgent(id);
    log.info('Agent resumed', { agentId: id, wallet });
    res.json({ ok: true, agent: updated });
  } catch (err) {
    log.error('Failed to resume agent', { agentId: id, err: err.message });
    res.status(500).json({ error: 'internal', message: 'Failed to resume agent' });
  }
});

// ---------------------------------------------------------------------------
// POST /v1/launch/agent/:id/connections — Update agent external connections
// ---------------------------------------------------------------------------
router.post('/launch/agent/:id/connections', authenticateApiKey, async (req, res) => {
  const { id } = req.params;
  const wallet = req.meterflow?.wallet;

  try {
    const agent = await getAgent(id);
    if (!agent) {
      return res.status(404).json({ error: 'agent_not_found' });
    }
    if (agent.wallet !== wallet) {
      return res.status(403).json({ error: 'not_owner', message: 'You do not own this agent' });
    }

    const { twitter, discord, telegram } = req.body;
    if (!twitter && !discord && !telegram) {
      return res.status(400).json({ error: 'invalid_request', message: 'Provide at least one connection (twitter, discord, telegram)' });
    }

    const connections = agent.connections || {};

    // Validate and merge twitter credentials
    if (twitter) {
      if (typeof twitter !== 'object') {
        return res.status(400).json({ error: 'invalid_field', message: 'twitter must be an object' });
      }
      const { apiKey: tk, apiSecret, accessToken, accessTokenSecret } = twitter;
      if (tk && typeof tk !== 'string') return res.status(400).json({ error: 'invalid_field', message: 'twitter.apiKey must be a string' });
      if (apiSecret && typeof apiSecret !== 'string') return res.status(400).json({ error: 'invalid_field', message: 'twitter.apiSecret must be a string' });
      connections.twitter = { ...connections.twitter, ...twitter };
    }

    // Validate and merge discord credentials
    if (discord) {
      if (typeof discord !== 'object') {
        return res.status(400).json({ error: 'invalid_field', message: 'discord must be an object' });
      }
      if (discord.channelIds && !Array.isArray(discord.channelIds)) {
        return res.status(400).json({ error: 'invalid_field', message: 'discord.channelIds must be an array' });
      }
      connections.discord = { ...connections.discord, ...discord };
    }

    // Validate and merge telegram credentials
    if (telegram) {
      if (typeof telegram !== 'object') {
        return res.status(400).json({ error: 'invalid_field', message: 'telegram must be an object' });
      }
      if (telegram.chatIds && !Array.isArray(telegram.chatIds)) {
        return res.status(400).json({ error: 'invalid_field', message: 'telegram.chatIds must be an array' });
      }
      connections.telegram = { ...connections.telegram, ...telegram };
    }

    agent.connections = encryptConnections(connections, id);
    await setFundedAgent(id, agent);

    log.info('Agent connections updated', { agentId: id, wallet, platforms: Object.keys(req.body).filter(k => ['twitter', 'discord', 'telegram'].includes(k)) });
    res.json({ ok: true, agent: maskCredentials(agent) });
  } catch (err) {
    log.error('Failed to update agent connections', { agentId: id, err: err.message });
    res.status(500).json({ error: 'internal', message: 'Failed to update connections' });
  }
});

// ---------------------------------------------------------------------------
// PUT /v1/launch/agent/:id/prompt — Update agent prompt & personality config
// ---------------------------------------------------------------------------
router.put('/launch/agent/:id/prompt', authenticateApiKey, async (req, res) => {
  const { id } = req.params;
  const wallet = req.meterflow?.wallet;

  try {
    const agent = await getAgent(id);
    if (!agent) {
      return res.status(404).json({ error: 'agent_not_found' });
    }
    if (agent.wallet !== wallet) {
      return res.status(403).json({ error: 'not_owner', message: 'You do not own this agent' });
    }

    const { systemPrompt, tweetConfig, tradeConfig, chatConfig } = req.body;

    if (systemPrompt !== undefined) {
      if (typeof systemPrompt !== 'string') {
        return res.status(400).json({ error: 'invalid_field', message: 'systemPrompt must be a string' });
      }
      agent.systemPrompt = systemPrompt;
    }

    // Merge tweetConfig updates
    if (tweetConfig !== undefined) {
      const parsed = parseJsonField(tweetConfig);
      if (!parsed || typeof parsed !== 'object') {
        return res.status(400).json({ error: 'invalid_field', message: 'tweetConfig must be an object' });
      }
      if (parsed.personality) agent.tweetConfig = { ...agent.tweetConfig, personality: parsed.personality };
      if (parsed.frequency && VALID_FREQUENCIES.includes(parsed.frequency)) {
        agent.tweetConfig = { ...agent.tweetConfig, frequency: parsed.frequency };
      }
      if (parsed.systemPrompt !== undefined) {
        agent.tweetConfig = { ...agent.tweetConfig, systemPrompt: parsed.systemPrompt };
      }
      if (parsed.topics) agent.tweetConfig = { ...agent.tweetConfig, topics: parsed.topics };
    }

    // Merge tradeConfig updates
    if (tradeConfig !== undefined) {
      const parsed = parseJsonField(tradeConfig);
      if (!parsed || typeof parsed !== 'object') {
        return res.status(400).json({ error: 'invalid_field', message: 'tradeConfig must be an object' });
      }
      if (parsed.strategy && VALID_STRATEGIES.includes(parsed.strategy)) {
        agent.tradeConfig = { ...agent.tradeConfig, strategy: parsed.strategy };
      }
      if (parsed.maxPositionSol !== undefined) {
        agent.tradeConfig = { ...agent.tradeConfig, maxPositionSol: Number(parsed.maxPositionSol) || 1 };
      }
      if (parsed.systemPrompt !== undefined) {
        agent.tradeConfig = { ...agent.tradeConfig, systemPrompt: parsed.systemPrompt };
      }
      if (parsed.pairs) agent.tradeConfig = { ...agent.tradeConfig, pairs: parsed.pairs };
    }

    // Merge chatConfig updates
    if (chatConfig !== undefined) {
      const parsed = parseJsonField(chatConfig);
      if (!parsed || typeof parsed !== 'object') {
        return res.status(400).json({ error: 'invalid_field', message: 'chatConfig must be an object' });
      }
      if (parsed.platform && VALID_PLATFORMS.includes(parsed.platform)) {
        agent.chatConfig = { ...agent.chatConfig, platform: parsed.platform };
      }
      if (parsed.personality) agent.chatConfig = { ...agent.chatConfig, personality: parsed.personality };
      if (parsed.respondTo && VALID_RESPOND_TO.includes(parsed.respondTo)) {
        agent.chatConfig = { ...agent.chatConfig, respondTo: parsed.respondTo };
      }
      if (parsed.systemPrompt !== undefined) {
        agent.chatConfig = { ...agent.chatConfig, systemPrompt: parsed.systemPrompt };
      }
    }

    await setFundedAgent(id, agent);
    log.info('Agent prompt updated', { agentId: id, wallet });
    res.json({ ok: true, agent: maskCredentials(agent) });
  } catch (err) {
    log.error('Failed to update agent prompt', { agentId: id, err: err.message });
    res.status(500).json({ error: 'internal', message: 'Failed to update prompt' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/launch/agent/:id/activity — Recent activity log
// ---------------------------------------------------------------------------
router.get('/launch/agent/:id/activity', authenticateApiKey, async (req, res) => {
  const { id } = req.params;
  const wallet = req.meterflow?.wallet;

  try {
    const agent = await getAgent(id);
    if (!agent) {
      return res.status(404).json({ error: 'agent_not_found' });
    }
    if (agent.wallet !== wallet) {
      return res.status(403).json({ error: 'not_owner', message: 'You do not own this agent' });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
    const typeFilter = req.query.type || null;
    const validTypes = ['tweet', 'trade', 'chat', 'error'];

    if (typeFilter && !validTypes.includes(typeFilter)) {
      return res.status(400).json({ error: 'invalid_type', message: `type must be one of: ${validTypes.join(', ')}` });
    }

    let activities = await getAgentLogs(id, limit);
    if (typeFilter) {
      activities = activities.filter(a => a.type === typeFilter);
    }

    res.json({ ok: true, activities });
  } catch (err) {
    log.error('Failed to get agent activity', { agentId: id, err: err.message });
    res.status(500).json({ error: 'internal', message: 'Failed to fetch activity' });
  }
});

// ---------------------------------------------------------------------------
// POST /v1/launch/agent/:id/activate — Activate a pending agent
// ---------------------------------------------------------------------------
router.post('/launch/agent/:id/activate', authenticateApiKey, async (req, res) => {
  const { id } = req.params;
  const wallet = req.meterflow?.wallet;

  try {
    const agent = await getAgent(id);
    if (!agent) {
      return res.status(404).json({ error: 'agent_not_found' });
    }
    if (agent.wallet !== wallet) {
      return res.status(403).json({ error: 'not_owner', message: 'You do not own this agent' });
    }
    if (agent.status === 'active') {
      return res.json({ ok: true, agent: maskCredentials(agent), message: 'Agent is already active' });
    }
    if (agent.status !== 'pending' && agent.status !== 'paused') {
      return res.status(409).json({ error: 'invalid_state', message: `Cannot activate agent with status "${agent.status}"` });
    }

    // Validate connections for enabled capabilities
    const connections = decryptConnections(agent.connections || {}, id);
    const missing = [];
    const validationErrors = [];

    if (agent.capabilities?.tweet) {
      if (!connections.twitter?.accessToken && !connections.twitter?.bearerToken) {
        missing.push('Twitter credentials required for tweet capability');
      } else {
        try {
          const token = connections.twitter.accessToken || connections.twitter.bearerToken;
          const tRes = await fetch('https://api.twitter.com/2/users/me', {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(8000),
          });
          if (!tRes.ok) validationErrors.push(`Twitter token invalid (${tRes.status})`);
        } catch (e) {
          validationErrors.push(`Twitter validation failed: ${e.message}`);
        }
      }
    }

    if (agent.capabilities?.chat) {
      const platform = agent.chatConfig?.platform || 'discord';
      if ((platform === 'discord' || platform === 'both')) {
        if (!connections.discord?.botToken) {
          missing.push('Discord bot token required for chat capability');
        } else {
          try {
            const dRes = await fetch('https://discord.com/api/v10/users/@me', {
              headers: { Authorization: `Bot ${connections.discord.botToken}` },
              signal: AbortSignal.timeout(8000),
            });
            if (!dRes.ok) validationErrors.push(`Discord bot token invalid (${dRes.status})`);
          } catch (e) {
            validationErrors.push(`Discord validation failed: ${e.message}`);
          }
        }
      }
      if ((platform === 'telegram' || platform === 'both')) {
        if (!connections.telegram?.botToken) {
          missing.push('Telegram bot token required for chat capability');
        } else {
          try {
            const tgRes = await fetch(`https://api.telegram.org/bot${connections.telegram.botToken}/getMe`, {
              signal: AbortSignal.timeout(8000),
            });
            const tgData = await tgRes.json();
            if (!tgData.ok) validationErrors.push(`Telegram bot token invalid`);
          } catch (e) {
            validationErrors.push(`Telegram validation failed: ${e.message}`);
          }
        }
      }
    }
    // Trade capability can activate without wallet (paper trading mode)

    if (missing.length > 0) {
      return res.status(400).json({ error: 'missing_connections', message: 'Configure required connections before activating', missing });
    }
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: 'invalid_connections', message: 'Some credentials failed validation', errors: validationErrors });
    }

    const updated = await activateFundedAgent(id);
    log.info('Agent activated', { agentId: id, wallet });
    res.json({ ok: true, agent: maskCredentials(updated) });
  } catch (err) {
    log.error('Failed to activate agent', { agentId: id, err: err.message });
    res.status(500).json({ error: 'internal', message: 'Failed to activate agent' });
  }
});

// ---------------------------------------------------------------------------
// POST /v1/launch/agent/:id/test — Dry-run an agent capability
// ---------------------------------------------------------------------------
router.post('/launch/agent/:id/test', authenticateApiKey, async (req, res) => {
  const { id } = req.params;
  const wallet = req.meterflow?.wallet;

  try {
    const agent = await getAgent(id);
    if (!agent) {
      return res.status(404).json({ error: 'agent_not_found' });
    }
    if (agent.wallet !== wallet) {
      return res.status(403).json({ error: 'not_owner', message: 'You do not own this agent' });
    }

    const { capability, context } = req.body;
    const validCapabilities = ['tweet', 'trade', 'chat'];

    if (!capability || !validCapabilities.includes(capability)) {
      return res.status(400).json({ error: 'invalid_capability', message: `capability must be one of: ${validCapabilities.join(', ')}` });
    }

    if (!agent.capabilities?.[capability]) {
      return res.status(400).json({ error: 'capability_disabled', message: `${capability} is not enabled on this agent` });
    }

    // Build the prompt the runtime would use
    const basePrompt = agent.systemPrompt || `You are ${agent.name}, an autonomous AI agent on Meterflow.`;
    let taskPrompt;

    if (capability === 'tweet') {
      const cfg = agent.tweetConfig || {};
      const capabilityPrompt = cfg.systemPrompt || '';
      taskPrompt = [
        basePrompt,
        capabilityPrompt,
        `Personality: ${cfg.personality || 'community builder'}`,
        cfg.topics?.length ? `Topics: ${cfg.topics.join(', ')}` : '',
        'Generate a single tweet. Keep it under 280 characters. Do not include quotes or hashtags unless relevant.',
      ].filter(Boolean).join('\n');
    } else if (capability === 'trade') {
      const cfg = agent.tradeConfig || {};
      const capabilityPrompt = cfg.systemPrompt || '';
      taskPrompt = [
        basePrompt,
        capabilityPrompt,
        `Strategy: ${cfg.strategy || 'moderate'}`,
        `Max position: ${cfg.maxPositionSol || 1} SOL`,
        'Analyze the current market and suggest a single trade action. Return JSON with fields: action (buy/sell/hold), token, amount, reasoning.',
      ].filter(Boolean).join('\n');
    } else {
      const cfg = agent.chatConfig || {};
      const capabilityPrompt = cfg.systemPrompt || '';
      taskPrompt = [
        basePrompt,
        capabilityPrompt,
        `Personality: ${cfg.personality || 'helpful assistant'}`,
        `Respond to: ${cfg.respondTo || 'mentions'}`,
        context ? `User message: ${context}` : 'Generate a sample response to a community question about the project.',
      ].filter(Boolean).join('\n');
    }

    // Call AI via the deployer's tier key (uses the cheapest available model)
    const { tierConfig } = req.meterflow;
    const testModel = tierConfig.models.find(m => m !== 'auto' && m.includes('flash'))
      || tierConfig.models.find(m => m !== 'auto' && m.includes('mini'))
      || tierConfig.models.find(m => m !== 'auto')
      || 'gemini-2.5-flash';

    const messages = [{ role: 'user', content: taskPrompt }];

    // Dynamic provider import based on model
    let result;
    if (testModel.startsWith('claude')) {
      const { proxyAnthropic } = await import('../providers/anthropic.js');
      result = await proxyAnthropic(testModel, messages, 512, 0.7);
    } else if (testModel.startsWith('gemini')) {
      const { proxyGemini } = await import('../providers/gemini.js');
      result = await proxyGemini(testModel, messages, 512, 0.7);
    } else if (testModel.startsWith('gpt-')) {
      const { proxyOpenAI } = await import('../providers/openai.js');
      result = await proxyOpenAI(testModel, messages, 512, 0.7);
    } else {
      return res.status(500).json({ error: 'no_model', message: 'No suitable model available for test' });
    }

    // Extract text from provider response (returns { content: [{ type: 'text', text }] })
    const preview = Array.isArray(result.content)
      ? result.content.map(b => b.text || '').join('')
      : (typeof result.content === 'string' ? result.content : JSON.stringify(result.content));

    // Return generated content without executing or spending credits
    res.json({
      ok: true,
      capability,
      model: testModel,
      preview,
      note: 'This is a dry run. Nothing was posted or executed. No credits were deducted.',
    });
  } catch (err) {
    log.error('Failed to test agent capability', { agentId: id, err: err.message });
    res.status(500).json({ error: 'internal', message: 'Failed to run test' });
  }
});

// ---------------------------------------------------------------------------
// POST /v1/launch/agent/:id/confirm-mint — Link token mint after on-chain confirm
// ---------------------------------------------------------------------------
router.post('/launch/agent/:id/confirm-mint', authenticateApiKey, async (req, res) => {
  const { id } = req.params;
  const wallet = req.meterflow?.wallet;

  try {
    const agent = await getAgent(id);
    if (!agent) return res.status(404).json({ error: 'agent_not_found' });
    if (agent.wallet !== wallet) return res.status(403).json({ error: 'not_owner' });
    if (agent.tokenMint) return res.json({ ok: true, agent: maskCredentials(agent), message: 'Token mint already linked' });

    const { mintAddress, signature } = req.body;
    if (!mintAddress || typeof mintAddress !== 'string') {
      return res.status(400).json({ error: 'mintAddress required' });
    }

    // Verify the transaction exists on-chain
    if (signature) {
      try {
        const txInfo = await solanaConnection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
        if (!txInfo) {
          return res.status(400).json({ error: 'tx_not_found', message: 'Transaction not confirmed on-chain yet. Try again in a few seconds.' });
        }
      } catch (e) {
        log.warn('Failed to verify mint tx', { signature, err: e.message });
      }
    }

    agent.tokenMint = mintAddress;
    agent.mintConfirmedAt = new Date().toISOString();
    if (signature) agent.mintSignature = signature;
    await setFundedAgent(id, agent);
    await setFundedAgentToken(mintAddress, id);

    // Seed initial credits so the agent can start operating
    const INITIAL_CREDITS = 50;
    await updateAgentCredits(id, INITIAL_CREDITS);

    log.info('Token mint confirmed', { agentId: id, mintAddress, signature });
    res.json({ ok: true, agent: maskCredentials(agent), creditsAdded: INITIAL_CREDITS });
  } catch (err) {
    log.error('Failed to confirm mint', { agentId: id, err: err.message });
    res.status(500).json({ error: 'internal', message: 'Failed to confirm mint' });
  }
});

// ---------------------------------------------------------------------------
// POST /v1/launch/webhook/fees — Credit agents from trading fee revenue
// ---------------------------------------------------------------------------
router.post('/launch/webhook/fees', async (req, res) => {
  const { mintAddress, feeSol, signature, source } = req.body;

  if (!mintAddress || !feeSol) {
    return res.status(400).json({ error: 'mintAddress and feeSol required' });
  }

  try {
    const { getFundedAgentByToken } = await import('../lib/kv-agents.js');
    const agentId = await getFundedAgentByToken(mintAddress);
    if (!agentId) {
      return res.json({ ok: true, credited: false, message: 'No agent linked to this token' });
    }

    const agent = await getAgent(agentId);
    if (!agent) {
      return res.json({ ok: true, credited: false, message: 'Agent not found' });
    }

    // Apply 70/30 split: 30% goes to agent credits
    const agentShareSol = feeSol * (agent.feeSplit?.agent || 30) / 100;
    // Convert SOL to credits (1 credit = 0.001 SOL)
    const creditsToAdd = Math.floor(agentShareSol / 0.001);

    if (creditsToAdd > 0) {
      await updateAgentCredits(agentId, creditsToAdd);
      const { appendAgentLog } = await import('../lib/kv-agents.js');
      await appendAgentLog(agentId, {
        type: 'credit_topup',
        content: `+${creditsToAdd} credits from ${agentShareSol.toFixed(6)} SOL fee (${source || 'unknown'})`,
        credits: creditsToAdd,
        feeSol,
        signature,
      });
    }

    log.info('Agent fee credited', { agentId, mintAddress, feeSol, creditsToAdd });
    res.json({ ok: true, credited: true, agentId, creditsAdded: creditsToAdd });
  } catch (err) {
    log.error('Fee webhook failed', { mintAddress, err: err.message });
    res.status(500).json({ error: 'internal', message: 'Failed to process fee' });
  }
});

// ---------------------------------------------------------------------------
// POST /v1/launch/agent/:id/validate — Validate agent credentials are live
// ---------------------------------------------------------------------------
router.post('/launch/agent/:id/validate', authenticateApiKey, async (req, res) => {
  const { id } = req.params;
  const wallet = req.meterflow?.wallet;

  try {
    const agent = await getAgent(id);
    if (!agent) return res.status(404).json({ error: 'agent_not_found' });
    if (agent.wallet !== wallet) return res.status(403).json({ error: 'not_owner' });

    const connections = decryptConnections(agent.connections || {}, id);
    const results = {};

    // Validate Twitter
    if (agent.capabilities?.tweet && connections.twitter) {
      try {
        const token = connections.twitter.accessToken || connections.twitter.bearerToken;
        if (!token) {
          results.twitter = { ok: false, error: 'No access token configured' };
        } else {
          const tRes = await fetch('https://api.twitter.com/2/users/me', {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(8000),
          });
          results.twitter = tRes.ok
            ? { ok: true, user: (await tRes.json()).data?.username }
            : { ok: false, error: `API returned ${tRes.status}` };
        }
      } catch (e) {
        results.twitter = { ok: false, error: e.message };
      }
    }

    // Validate Discord bot
    if (agent.capabilities?.chat && connections.discord?.botToken) {
      try {
        const dRes = await fetch('https://discord.com/api/v10/users/@me', {
          headers: { Authorization: `Bot ${connections.discord.botToken}` },
          signal: AbortSignal.timeout(8000),
        });
        results.discord = dRes.ok
          ? { ok: true, bot: (await dRes.json()).username }
          : { ok: false, error: `API returned ${dRes.status}` };
      } catch (e) {
        results.discord = { ok: false, error: e.message };
      }
    }

    // Validate Telegram bot
    if (agent.capabilities?.chat && connections.telegram?.botToken) {
      try {
        const tgRes = await fetch(`https://api.telegram.org/bot${connections.telegram.botToken}/getMe`, {
          signal: AbortSignal.timeout(8000),
        });
        const tgData = await tgRes.json();
        results.telegram = tgData.ok
          ? { ok: true, bot: tgData.result?.username }
          : { ok: false, error: tgData.description || 'Invalid token' };
      } catch (e) {
        results.telegram = { ok: false, error: e.message };
      }
    }

    const allValid = Object.values(results).every(r => r.ok);
    res.json({ ok: true, allValid, results });
  } catch (err) {
    log.error('Failed to validate credentials', { agentId: id, err: err.message });
    res.status(500).json({ error: 'internal', message: 'Failed to validate credentials' });
  }
});

// ---------------------------------------------------------------------------
// POST /v1/launch/agent/:id/fund — Manually add credits to an agent
// ---------------------------------------------------------------------------
router.post('/launch/agent/:id/fund', authenticateApiKey, async (req, res) => {
  const { id } = req.params;
  const wallet = req.meterflow?.wallet;

  try {
    const agent = await getAgent(id);
    if (!agent) return res.status(404).json({ error: 'agent_not_found' });
    if (agent.wallet !== wallet) return res.status(403).json({ error: 'not_owner' });

    const { credits, signature } = req.body;
    if (!credits || typeof credits !== 'number' || credits <= 0 || credits > 10000) {
      return res.status(400).json({ error: 'credits must be a positive number (max 10000)' });
    }

    const updated = await updateAgentCredits(id, credits);

    // If agent was depleted, restore to paused so user can reactivate
    if (updated.status === 'depleted' && updated.credits.balance > 0) {
      updated.status = 'paused';
      await setFundedAgent(id, updated);
    }

    const { appendAgentLog } = await import('../lib/kv-agents.js');
    await appendAgentLog(id, {
      type: 'credit_topup',
      content: `+${credits} credits manually funded`,
      credits,
      signature: signature || null,
    });

    log.info('Agent manually funded', { agentId: id, credits });
    res.json({ ok: true, agent: maskCredentials(updated) });
  } catch (err) {
    log.error('Failed to fund agent', { agentId: id, err: err.message });
    res.status(500).json({ error: 'internal', message: 'Failed to fund agent' });
  }
});

export default router;
