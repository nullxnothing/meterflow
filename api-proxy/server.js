import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { config } from 'dotenv';
config();

// ═══════════════════════════════════════════
// INFINITE Protocol — API Proxy Server
// ═══════════════════════════════════════════
//
// Flow:
// 1. User connects wallet on dashboard, signs message
// 2. Server verifies signature, checks token balance via Helius
// 3. Server issues an API key (inf_xxxxx) tied to wallet
// 4. User makes API calls with their key
// 5. Proxy checks rate limits, forwards to Claude/Gemini
// 6. Usage is tracked, balance is periodically re-verified
// ═══════════════════════════════════════════

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ─── In-Memory Store (swap for Redis in production) ──────────
// For production, replace these Maps with Redis calls
const apiKeys = new Map();      // apiKey -> { wallet, tier, createdAt }
const walletKeys = new Map();   // wallet -> apiKey
const usageCounts = new Map();  // apiKey -> { date, count, tokens }
const balanceCache = new Map(); // wallet -> { balance, checkedAt }

// ─── Config ──────────────────────────────────────────────────
const CONFIG = {
  HELIUS_API_KEY: process.env.HELIUS_API_KEY || '',
  HELIUS_RPC_URL: process.env.HELIUS_RPC_URL || '',
  TOKEN_MINT: process.env.INFINITE_TOKEN_MINT || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
  API_KEY_SECRET: process.env.API_KEY_SECRET || 'dev-secret-change-me',
  TIERS: {
    architect: {
      min: parseInt(process.env.TIER_ARCHITECT_MIN || '1000000'),
      dailyLimit: parseInt(process.env.TIER_ARCHITECT_DAILY_LIMIT || '999999'),
      models: ['claude-sonnet-4-5-20250929', 'claude-opus-4-6', 'gemini-2.5-pro', 'gemini-2.5-flash'],
      label: 'Architect'
    },
    operator: {
      min: parseInt(process.env.TIER_OPERATOR_MIN || '100000'),
      dailyLimit: parseInt(process.env.TIER_OPERATOR_DAILY_LIMIT || '10000'),
      models: ['claude-sonnet-4-5-20250929', 'gemini-2.5-pro', 'gemini-2.5-flash'],
      label: 'Operator'
    },
    signal: {
      min: parseInt(process.env.TIER_SIGNAL_MIN || '10000'),
      dailyLimit: parseInt(process.env.TIER_SIGNAL_DAILY_LIMIT || '1000'),
      models: ['claude-sonnet-4-5-20250929', 'gemini-2.5-flash'],
      label: 'Signal'
    }
  },
  BALANCE_CACHE_TTL: 5 * 60 * 1000, // 5 minutes
};

// ─── Helpers ─────────────────────────────────────────────────

function generateApiKey() {
  const random = crypto.randomBytes(24).toString('hex');
  return `inf_${random}`;
}

function getTierForBalance(balance) {
  if (balance >= CONFIG.TIERS.architect.min) return 'architect';
  if (balance >= CONFIG.TIERS.operator.min) return 'operator';
  if (balance >= CONFIG.TIERS.signal.min) return 'signal';
  return null;
}

function getTodayKey() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function getUsage(apiKey) {
  const today = getTodayKey();
  const usage = usageCounts.get(apiKey);
  if (!usage || usage.date !== today) {
    const fresh = { date: today, count: 0, tokens: 0 };
    usageCounts.set(apiKey, fresh);
    return fresh;
  }
  return usage;
}

// ─── Helius: Check Token Balance ─────────────────────────────

async function getTokenBalance(walletAddress) {
  // Check cache first
  const cached = balanceCache.get(walletAddress);
  if (cached && Date.now() - cached.checkedAt < CONFIG.BALANCE_CACHE_TTL) {
    return cached.balance;
  }

  try {
    // Use Helius DAS API to get token balances
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${CONFIG.HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'infinite-balance-check',
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { mint: CONFIG.TOKEN_MINT },
          { encoding: 'jsonParsed' }
        ]
      })
    });

    const data = await response.json();
    let balance = 0;

    if (data.result?.value?.length > 0) {
      balance = data.result.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
    }

    balanceCache.set(walletAddress, { balance, checkedAt: Date.now() });
    return balance;
  } catch (err) {
    console.error('Balance check failed:', err.message);
    // Return cached value if available, even if stale
    if (cached) return cached.balance;
    return 0;
  }
}

// ─── Auth Middleware ──────────────────────────────────────────

async function authenticateApiKey(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'missing_api_key',
      message: 'Include your INFINITE API key as: Authorization: Bearer inf_xxxxx'
    });
  }

  const apiKey = authHeader.split(' ')[1];
  const keyData = apiKeys.get(apiKey);

  if (!keyData) {
    return res.status(401).json({
      error: 'invalid_api_key',
      message: 'API key not found. Generate one at app.infinite.sh'
    });
  }

  // Re-check balance periodically
  const balance = await getTokenBalance(keyData.wallet);
  const tier = getTierForBalance(balance);

  if (!tier) {
    return res.status(403).json({
      error: 'insufficient_balance',
      message: `Your wallet holds ${balance.toLocaleString()} $INFINITE. Minimum ${CONFIG.TIERS.signal.min.toLocaleString()} required.`,
      balance,
      required: CONFIG.TIERS.signal.min
    });
  }

  // Update tier if changed
  keyData.tier = tier;
  keyData.balance = balance;

  // Check rate limit
  const usage = getUsage(apiKey);
  const tierConfig = CONFIG.TIERS[tier];

  if (usage.count >= tierConfig.dailyLimit) {
    return res.status(429).json({
      error: 'rate_limit_exceeded',
      message: `Daily limit of ${tierConfig.dailyLimit.toLocaleString()} calls reached for ${tierConfig.label} tier.`,
      tier: tierConfig.label,
      limit: tierConfig.dailyLimit,
      used: usage.count,
      resetsAt: getTodayKey() + 'T00:00:00Z'
    });
  }

  req.infinite = { apiKey, ...keyData, tierConfig, usage };
  next();
}

// ─── Routes: Auth ────────────────────────────────────────────

// POST /auth/register — Verify wallet ownership and issue API key
app.post('/auth/register', async (req, res) => {
  const { wallet, signature, message } = req.body;

  if (!wallet || !signature || !message) {
    return res.status(400).json({
      error: 'missing_fields',
      message: 'Required: wallet, signature, message'
    });
  }

  // Verify the signature matches the wallet
  // In production, use tweetnacl to verify ed25519 signature
  // For now, we trust the frontend wallet adapter signature
  try {
    // TODO: Full signature verification with tweetnacl
    // const verified = nacl.sign.detached.verify(
    //   new TextEncoder().encode(message),
    //   bs58.decode(signature),
    //   bs58.decode(wallet)
    // );

    // Check token balance
    const balance = await getTokenBalance(wallet);
    const tier = getTierForBalance(balance);

    if (!tier) {
      return res.status(403).json({
        error: 'insufficient_balance',
        message: `Wallet holds ${balance.toLocaleString()} $INFINITE. Minimum ${CONFIG.TIERS.signal.min.toLocaleString()} required.`,
        balance,
        tiers: Object.entries(CONFIG.TIERS).map(([key, t]) => ({
          name: t.label,
          min: t.min,
          dailyLimit: t.dailyLimit
        }))
      });
    }

    // Check if wallet already has a key
    let apiKey = walletKeys.get(wallet);
    if (apiKey && apiKeys.has(apiKey)) {
      // Return existing key
      const existing = apiKeys.get(apiKey);
      existing.tier = tier;
      existing.balance = balance;
      return res.json({
        apiKey,
        tier: CONFIG.TIERS[tier].label,
        balance,
        dailyLimit: CONFIG.TIERS[tier].dailyLimit,
        models: CONFIG.TIERS[tier].models,
        message: 'Existing key returned. Tier updated.'
      });
    }

    // Generate new key
    apiKey = generateApiKey();
    apiKeys.set(apiKey, {
      wallet,
      tier,
      balance,
      createdAt: Date.now()
    });
    walletKeys.set(wallet, apiKey);

    res.json({
      apiKey,
      tier: CONFIG.TIERS[tier].label,
      balance,
      dailyLimit: CONFIG.TIERS[tier].dailyLimit,
      models: CONFIG.TIERS[tier].models,
      message: 'API key generated. Keep it safe.'
    });

  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'registration_failed', message: err.message });
  }
});

// GET /auth/status — Check current key status
app.get('/auth/status', authenticateApiKey, (req, res) => {
  const { wallet, tier, balance, tierConfig, usage } = req.infinite;
  res.json({
    wallet,
    tier: tierConfig.label,
    balance,
    usage: {
      today: usage.count,
      limit: tierConfig.dailyLimit,
      remaining: tierConfig.dailyLimit - usage.count
    },
    models: tierConfig.models
  });
});

// ─── Routes: AI Proxy ────────────────────────────────────────

// POST /v1/chat — Proxy to Claude or Gemini
app.post('/v1/chat', authenticateApiKey, async (req, res) => {
  const { model, messages, max_tokens, temperature, stream } = req.body;
  const { tierConfig, usage, apiKey } = req.infinite;

  // Default model
  const requestedModel = model || tierConfig.models[0];

  // Check model access
  if (!tierConfig.models.includes(requestedModel)) {
    return res.status(403).json({
      error: 'model_not_available',
      message: `${requestedModel} is not available on your ${tierConfig.label} tier.`,
      availableModels: tierConfig.models
    });
  }

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'messages array is required'
    });
  }

  try {
    let result;

    if (requestedModel.startsWith('claude')) {
      result = await proxyAnthropic(requestedModel, messages, max_tokens || 1024, temperature);
    } else if (requestedModel.startsWith('gemini')) {
      result = await proxyGemini(requestedModel, messages, max_tokens || 1024, temperature);
    } else {
      return res.status(400).json({ error: 'unknown_model', message: `Unknown model: ${requestedModel}` });
    }

    // Track usage
    usage.count++;
    usage.tokens += result.usage?.totalTokens || 0;

    res.json({
      id: `inf-${crypto.randomBytes(12).toString('hex')}`,
      model: requestedModel,
      content: result.content,
      usage: {
        inputTokens: result.usage?.inputTokens || 0,
        outputTokens: result.usage?.outputTokens || 0,
        cost: '$0.00 — funded by $INFINITE treasury'
      },
      rateLimit: {
        remaining: tierConfig.dailyLimit - usage.count,
        limit: tierConfig.dailyLimit
      }
    });

  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(502).json({
      error: 'upstream_error',
      message: 'AI provider returned an error. Try again.',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// ─── AI Provider Proxies ─────────────────────────────────────

async function proxyAnthropic(model, messages, maxTokens, temperature) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CONFIG.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: Math.min(maxTokens, 4096),
      temperature: temperature ?? 0.7,
      messages
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic ${response.status}: ${err}`);
  }

  const data = await response.json();
  return {
    content: data.content,
    usage: {
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
      totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
    }
  };
}

async function proxyGemini(model, messages, maxTokens, temperature) {
  // Convert from Claude message format to Gemini format
  const geminiContents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: typeof m.content === 'string' ? m.content : m.content.map(c => c.text).join('') }]
  }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${CONFIG.GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: geminiContents,
        generationConfig: {
          maxOutputTokens: Math.min(maxTokens, 4096),
          temperature: temperature ?? 0.7
        }
      })
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return {
    content: [{ type: 'text', text }],
    usage: {
      inputTokens: data.usageMetadata?.promptTokenCount || 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: data.usageMetadata?.totalTokenCount || 0
    }
  };
}

// ─── Routes: Treasury & Stats ────────────────────────────────

app.get('/stats', (req, res) => {
  const today = getTodayKey();
  let totalCallsToday = 0;
  let totalTokensToday = 0;
  let activeKeys = 0;

  for (const [key, usage] of usageCounts) {
    if (usage.date === today) {
      totalCallsToday += usage.count;
      totalTokensToday += usage.tokens;
    }
  }

  for (const [key, data] of apiKeys) {
    if (data.tier) activeKeys++;
  }

  res.json({
    totalCallsToday,
    totalTokensToday,
    activeKeys,
    totalKeysIssued: apiKeys.size,
    tiers: Object.entries(CONFIG.TIERS).map(([key, t]) => ({
      name: t.label,
      min: t.min,
      dailyLimit: t.dailyLimit,
      models: t.models
    }))
  });
});

// ─── Routes: Key Management ──────────────────────────────────

// POST /auth/revoke — Revoke your own key
app.post('/auth/revoke', authenticateApiKey, (req, res) => {
  const { apiKey, wallet } = req.infinite;
  apiKeys.delete(apiKey);
  walletKeys.delete(wallet);
  usageCounts.delete(apiKey);
  res.json({ message: 'API key revoked. Generate a new one at any time.' });
});

// POST /auth/rotate — Get a new key (revokes old one)
app.post('/auth/rotate', authenticateApiKey, async (req, res) => {
  const { apiKey: oldKey, wallet, tier, balance } = req.infinite;

  // Revoke old
  apiKeys.delete(oldKey);
  usageCounts.delete(oldKey);

  // Generate new
  const newKey = generateApiKey();
  apiKeys.set(newKey, { wallet, tier, balance, createdAt: Date.now() });
  walletKeys.set(wallet, newKey);

  res.json({
    apiKey: newKey,
    tier: CONFIG.TIERS[tier].label,
    message: 'New key issued. Old key is now invalid.'
  });
});

// ─── Health ──────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', protocol: 'INFINITE' });
});

// ─── Start ───────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║  ∞  INFINITE API Proxy                   ║
  ║  Running on port ${PORT}                    ║
  ║  Token: ${CONFIG.TOKEN_MINT.slice(0, 8) || 'NOT SET'}...              ║
  ╚══════════════════════════════════════════╝
  `);
});

export default app;
