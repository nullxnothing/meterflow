// Funded Agent Launch — token creation + agent provisioning
import crypto from 'crypto';
import { Router } from 'express';
import { authenticateApiKey } from '../middleware.js';
import { CONFIG } from '../config.js';
import { logger } from '../lib/logger.js';
import {
  getAgent,
  setFundedAgent,
  getFundedAgentsByWallet,
  addFundedAgentToWallet,
  setFundedAgentToken,
  pauseFundedAgent,
  activateFundedAgent,
} from '../lib/kv-agents.js';

const router = Router();
const log = logger.child({ mod: 'launch' });
const PUMPPORTAL_API = 'https://pumpportal.fun/api/trade-local';
const PUMP_IPFS = 'https://pump.fun/api/ipfs';
const TREASURY_WALLET = CONFIG.TREASURY_WALLET;

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

/** Build the full agent config object */
function buildAgentConfig({ id, wallet, name, symbol, description, imageUrl, capabilities, tweetConfig, tradeConfig, chatConfig, metadataUri, tokenMetadata }) {
  return {
    id,
    wallet,
    tokenMint: null, // set after on-chain confirmation
    name,
    symbol,
    description: description || `Funded agent launched via Infinite Protocol.`,
    imageUrl: imageUrl || null,
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
router.post('/launch/create', authenticateApiKey, async (req, res) => {
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

  const wallet = req.infinite?.wallet;
  if (!wallet) {
    return res.status(400).json({ error: 'wallet not found on API key — reconnect your wallet' });
  }

  try {
    // Step 1: Build IPFS form data
    const formData = new FormData();
    formData.append('name', name);
    formData.append('symbol', symbol);
    formData.append('description', description || `Funded agent launched via Infinite Protocol. Creator fees fund AI operations.`);
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

    const agentConfig = buildAgentConfig({
      id: agentId,
      wallet,
      name,
      symbol,
      description,
      imageUrl: ipfsData.metadataUri ? resolvedImageUrl : null,
      capabilities,
      tweetConfig,
      tradeConfig,
      chatConfig,
      metadataUri: ipfsData.metadataUri,
      tokenMetadata,
    });

    // Step 5: Persist agent
    await setFundedAgent(agentId, agentConfig);
    await addFundedAgentToWallet(wallet, agentId);

    log.info('Funded agent created', { agentId, wallet, name, symbol });

    res.json({
      ok: true,
      agent: agentConfig,
      metadataUri: ipfsData.metadataUri,
      tokenMetadata,
      treasury: TREASURY_WALLET,
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
      'Creator fees are split: 70% to Infinite treasury, 30% funds your agent',
      'Your agent uses its credit balance to operate autonomously',
      'More trading volume = more agent credits = more powerful agent',
    ],
  });
});

// ---------------------------------------------------------------------------
// GET /v1/launch/agents — List all agents for the authenticated wallet
// ---------------------------------------------------------------------------
router.get('/launch/agents', authenticateApiKey, async (req, res) => {
  const wallet = req.infinite?.wallet;
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

    res.json({ ok: true, agents });
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
  const wallet = req.infinite?.wallet;

  try {
    const agent = await getAgent(id);
    if (!agent) {
      return res.status(404).json({ error: 'agent_not_found' });
    }
    if (agent.wallet !== wallet) {
      return res.status(403).json({ error: 'not_owner', message: 'You do not own this agent' });
    }

    res.json({ ok: true, agent });
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
  const wallet = req.infinite?.wallet;

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
  const wallet = req.infinite?.wallet;

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

export default router;
