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
const videoOperations = new Map(); // operationName -> { apiKey, prompt, status, result }

// ─── Config ──────────────────────────────────────────────────
const CONFIG = {
  HELIUS_API_KEY: process.env.HELIUS_API_KEY || '',
  HELIUS_RPC_URL: process.env.HELIUS_RPC_URL || '',
  TOKEN_MINT: process.env.INFINITE_TOKEN_MINT || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  API_KEY_SECRET: process.env.API_KEY_SECRET || 'dev-secret-change-me',
  TIERS: {
    architect: {
      min: parseInt(process.env.TIER_ARCHITECT_MIN || '1000000'),
      dailyLimit: parseInt(process.env.TIER_ARCHITECT_DAILY_LIMIT || '999999'),
      models: ['claude-sonnet-4-5-20250929', 'claude-opus-4-6', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gpt-4o', 'gpt-4o-mini'],
      label: 'Architect'
    },
    operator: {
      min: parseInt(process.env.TIER_OPERATOR_MIN || '100000'),
      dailyLimit: parseInt(process.env.TIER_OPERATOR_DAILY_LIMIT || '10000'),
      models: ['claude-sonnet-4-5-20250929', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gpt-4o', 'gpt-4o-mini'],
      label: 'Operator'
    },
    signal: {
      min: parseInt(process.env.TIER_SIGNAL_MIN || '10000'),
      dailyLimit: parseInt(process.env.TIER_SIGNAL_DAILY_LIMIT || '1000'),
      models: ['claude-sonnet-4-5-20250929', 'gemini-2.5-flash', 'gpt-4o-mini'],
      label: 'Signal'
    }
  },
  BALANCE_CACHE_TTL: 5 * 60 * 1000, // 5 minutes
};

const PROVIDER_AVAILABLE = {
  claude: !!CONFIG.ANTHROPIC_API_KEY,
  gemini: !!CONFIG.GOOGLE_API_KEY,
  openai: !!CONFIG.OPENAI_API_KEY,
};

function getProviderForModel(model) {
  if (model.startsWith('claude')) return 'claude';
  if (model.startsWith('gemini')) return 'gemini';
  if (model.startsWith('gpt-')) return 'openai';
  return null;
}

function isModelAvailable(model) {
  const provider = getProviderForModel(model);
  return provider ? PROVIDER_AVAILABLE[provider] : false;
}

// ─── Helpers ─────────────────────────────────────────────────

function generateApiKey() {
  const random = crypto.randomBytes(24).toString('hex');
  return `inf_${random}`;
}

// When TOKEN_MINT is not set, grant operator tier to any connected wallet
const TOKEN_GATING_ENABLED = CONFIG.TOKEN_MINT && CONFIG.TOKEN_MINT !== 'PASTE_YOUR_TOKEN_MINT_HERE';

function getTierForBalance(balance) {
  if (!TOKEN_GATING_ENABLED) return 'operator';
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

// ─── Video + Trading Config ──────────────────────────────────

const VIDEO_ALLOWED_TIERS = ['operator', 'architect'];
const VIDEO_CALL_COST = 10;

const TRADING_SYSTEM_PROMPT = `You are an expert Solana blockchain trading analyst. You have deep knowledge of:
- Token fundamentals: liquidity, market cap, holder distribution, supply mechanics
- DeFi protocols: Raydium, Jupiter, Orca, Pump.fun, PumpSwap
- On-chain analysis: wallet tracking, smart money flows, whale movements
- Risk assessment: rug pull indicators, honeypot detection, contract audits
- Market microstructure: order flow, MEV, slippage, priority fees

When analyzing tokens:
1. Always assess risk level (LOW / MEDIUM / HIGH / CRITICAL)
2. Provide specific entry/exit zones when relevant
3. Flag any red flags immediately (frozen mint authority, low liquidity, concentrated holders)
4. Use data-driven reasoning, not hype
5. Include relevant on-chain metrics when available

Format responses with clear sections, use markdown. Be direct and actionable.
Never provide financial advice — frame everything as analysis and education.`;

async function fetchTokenInfo(address) {
  const info = { address, name: null, symbol: null, price: null, marketCap: null, liquidity: null, change24h: null };

  const [assetResult, priceResult, dexResult] = await Promise.allSettled([
    fetch(`https://mainnet.helius-rpc.com/?api-key=${CONFIG.HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'token-info', method: 'getAsset', params: { id: address } })
    }).then(r => r.json()),
    fetch(`https://api.jup.ag/price/v2?ids=${address}`).then(r => r.json()),
    fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`).then(r => r.json()),
  ]);

  if (assetResult.status === 'fulfilled' && assetResult.value.result) {
    const asset = assetResult.value.result;
    info.name = asset.content?.metadata?.name || null;
    info.symbol = asset.content?.metadata?.symbol || null;
  }

  if (priceResult.status === 'fulfilled' && priceResult.value.data?.[address]) {
    info.price = parseFloat(priceResult.value.data[address].price) || null;
  }

  if (dexResult.status === 'fulfilled' && dexResult.value.pairs?.length > 0) {
    const pair = dexResult.value.pairs[0];
    info.marketCap = pair.marketCap || null;
    info.liquidity = pair.liquidity?.usd || null;
    info.change24h = pair.priceChange?.h24 || null;
    if (!info.price && pair.priceUsd) info.price = parseFloat(pair.priceUsd);
    if (!info.name && pair.baseToken?.name) info.name = pair.baseToken.name;
    if (!info.symbol && pair.baseToken?.symbol) info.symbol = pair.baseToken.symbol;
  }

  return info;
}

// ─── Helius: Check Token Balance ─────────────────────────────

async function getTokenBalance(walletAddress) {
  if (!TOKEN_GATING_ENABLED) return 0;

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
      const allModels = CONFIG.TIERS[tier].models;
      return res.json({
        apiKey,
        tier: CONFIG.TIERS[tier].label,
        balance,
        dailyLimit: CONFIG.TIERS[tier].dailyLimit,
        models: allModels.filter(isModelAvailable),
        comingSoon: allModels.filter(m => !isModelAvailable(m)),
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

    const allModels = CONFIG.TIERS[tier].models;
    res.json({
      apiKey,
      tier: CONFIG.TIERS[tier].label,
      balance,
      dailyLimit: CONFIG.TIERS[tier].dailyLimit,
      models: allModels.filter(isModelAvailable),
      comingSoon: allModels.filter(m => !isModelAvailable(m)),
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
    models: tierConfig.models.filter(isModelAvailable),
    comingSoon: tierConfig.models.filter(m => !isModelAvailable(m)),
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

  if (!isModelAvailable(requestedModel)) {
    return res.status(503).json({
      error: 'model_coming_soon',
      message: `${requestedModel} is coming soon. Stay tuned.`,
      availableModels: tierConfig.models.filter(isModelAvailable),
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
    } else if (requestedModel.startsWith('gpt-')) {
      result = await proxyOpenAI(requestedModel, messages, max_tokens || 1024, temperature);
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

async function proxyOpenAI(model, messages, maxTokens, temperature) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: Math.min(maxTokens, 4096),
      temperature: temperature ?? 0.7,
      messages,
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';

  return {
    content: [{ type: 'text', text }],
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    }
  };
}

// ─── Streaming Chat Endpoint ─────────────────────────────────

// POST /v1/chat/stream — SSE streaming proxy to Claude or Gemini
app.post('/v1/chat/stream', authenticateApiKey, async (req, res) => {
  const { model, messages, max_tokens, temperature } = req.body;
  const { tierConfig, usage } = req.infinite;

  const requestedModel = model || tierConfig.models[0];

  if (!tierConfig.models.includes(requestedModel)) {
    return res.status(403).json({
      error: 'model_not_available',
      message: `${requestedModel} is not available on your ${tierConfig.label} tier.`,
      availableModels: tierConfig.models
    });
  }

  if (!isModelAvailable(requestedModel)) {
    return res.status(503).json({
      error: 'model_coming_soon',
      message: `${requestedModel} is coming soon. Stay tuned.`,
      availableModels: tierConfig.models.filter(isModelAvailable),
    });
  }

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'invalid_request', message: 'messages array is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    if (requestedModel.startsWith('claude')) {
      await streamAnthropic(requestedModel, messages, max_tokens || 4096, temperature, res);
    } else if (requestedModel.startsWith('gemini')) {
      await streamGemini(requestedModel, messages, max_tokens || 4096, temperature, res);
    } else if (requestedModel.startsWith('gpt-')) {
      await streamOpenAI(requestedModel, messages, max_tokens || 4096, temperature, res);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: `Unknown model: ${requestedModel}` })}\n\n`);
    }

    usage.count++;
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Stream error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

async function streamAnthropic(model, messages, maxTokens, temperature, res) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CONFIG.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: Math.min(maxTokens, 8192),
      temperature: temperature ?? 0.7,
      messages,
      stream: true
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic ${response.status}: ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;

      try {
        const event = JSON.parse(jsonStr);
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          res.write(`data: ${JSON.stringify({ type: 'text', content: event.delta.text })}\n\n`);
        }
      } catch {}
    }
  }
}

async function streamGemini(model, messages, maxTokens, temperature, res) {
  const geminiContents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: typeof m.content === 'string' ? m.content : m.content.map(c => c.text).join('') }]
  }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${CONFIG.GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: geminiContents,
        generationConfig: {
          maxOutputTokens: Math.min(maxTokens, 8192),
          temperature: temperature ?? 0.7
        }
      })
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini ${response.status}: ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr) continue;

      try {
        const data = JSON.parse(jsonStr);
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
        }
      } catch {}
    }
  }
}

async function streamOpenAI(model, messages, maxTokens, temperature, res) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: Math.min(maxTokens, 8192),
      temperature: temperature ?? 0.7,
      messages,
      stream: true,
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI ${response.status}: ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;

      try {
        const data = JSON.parse(jsonStr);
        const text = data.choices?.[0]?.delta?.content;
        if (text) {
          res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
        }
      } catch {}
    }
  }
}

// ─── Image Generation Endpoint ──────────────────────────────

// POST /v1/image — Generate image via Gemini
app.post('/v1/image', authenticateApiKey, async (req, res) => {
  const { prompt } = req.body;
  const { tierConfig, usage } = req.infinite;

  if (!prompt) {
    return res.status(400).json({ error: 'invalid_request', message: 'prompt is required' });
  }

  try {
    const imageModel = process.env.IMAGE_MODEL || 'gemini-2.0-flash-exp';

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:generateContent?key=${CONFIG.GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT']
          }
        })
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini Image ${response.status}: ${err}`);
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts || [];

    const images = [];
    let text = '';

    for (const part of parts) {
      if (part.inlineData) {
        images.push({
          mimeType: part.inlineData.mimeType,
          data: part.inlineData.data
        });
      }
      if (part.text) {
        text += part.text;
      }
    }

    if (images.length === 0) {
      return res.status(422).json({
        error: 'no_image_generated',
        message: text || 'The model did not return an image. Try a different prompt.',
      });
    }

    usage.count++;

    res.json({
      id: `inf-img-${crypto.randomBytes(8).toString('hex')}`,
      images,
      text,
      usage: { cost: '$0.00 — funded by $INFINITE treasury' }
    });

  } catch (err) {
    console.error('Image generation error:', err.message);
    res.status(502).json({
      error: 'upstream_error',
      message: 'Image generation failed. Try a different prompt.',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// ─── Video Generation Endpoints ──────────────────────────────

// POST /v1/video/generate — Start async video generation via Veo 2
app.post('/v1/video/generate', authenticateApiKey, async (req, res) => {
  const { prompt, aspectRatio, duration } = req.body;
  const { tierConfig, usage, apiKey, tier } = req.infinite;

  if (!VIDEO_ALLOWED_TIERS.includes(tier)) {
    return res.status(403).json({
      error: 'tier_restricted',
      message: 'Video generation requires Operator tier or above.',
      requiredTier: 'Operator',
      currentTier: tierConfig.label,
    });
  }

  if (!prompt) {
    return res.status(400).json({ error: 'invalid_request', message: 'prompt is required' });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:predictLongRunning?key=${CONFIG.GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            aspectRatio: aspectRatio || '16:9',
            durationSeconds: duration || 5,
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Veo ${response.status}: ${err}`);
    }

    const data = await response.json();
    const operationName = data.name;

    if (!operationName) {
      throw new Error('No operation name returned from Veo API');
    }

    videoOperations.set(operationName, { apiKey, prompt, status: 'pending', createdAt: Date.now() });

    usage.count += VIDEO_CALL_COST;

    res.json({
      operationName,
      status: 'pending',
      message: 'Video generation started. Poll /v1/video/status/:operationName for updates.',
      estimatedTime: '1-3 minutes',
    });
  } catch (err) {
    console.error('Video generation error:', err.message);
    res.status(502).json({
      error: 'upstream_error',
      message: 'Video generation failed. Try a different prompt.',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

// GET /v1/video/status/:operationName — Poll video generation status
app.get('/v1/video/status/:operationName', authenticateApiKey, async (req, res) => {
  const { operationName } = req.params;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${CONFIG.GOOGLE_API_KEY}`
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Veo status ${response.status}: ${err}`);
    }

    const data = await response.json();

    if (data.done) {
      if (data.error) {
        videoOperations.set(operationName, { ...videoOperations.get(operationName), status: 'failed', error: data.error.message });
        return res.json({ status: 'failed', error: data.error.message });
      }

      const video = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video;
      videoOperations.set(operationName, { ...videoOperations.get(operationName), status: 'complete', video });

      return res.json({
        status: 'complete',
        video: video ? { uri: video.uri, mimeType: video.mimeType || 'video/mp4' } : null,
      });
    }

    res.json({ status: 'pending', metadata: data.metadata || null });
  } catch (err) {
    console.error('Video status error:', err.message);
    res.status(502).json({ error: 'upstream_error', message: err.message });
  }
});

// ─── Trading Agent Endpoints ─────────────────────────────────

// POST /v1/trading/analyze — AI trading analysis with optional token context
app.post('/v1/trading/analyze', authenticateApiKey, async (req, res) => {
  const { query, tokenAddress, messages: clientMessages, model } = req.body;
  const { tierConfig, usage } = req.infinite;

  if (!query && (!clientMessages || !clientMessages.length)) {
    return res.status(400).json({ error: 'invalid_request', message: 'query or messages required' });
  }

  const requestedModel = model || tierConfig.models[0];
  if (!tierConfig.models.includes(requestedModel)) {
    return res.status(403).json({
      error: 'model_not_available',
      message: `${requestedModel} is not available on your ${tierConfig.label} tier.`,
      availableModels: tierConfig.models,
    });
  }

  let tokenContext = '';
  if (tokenAddress) {
    try {
      const info = await fetchTokenInfo(tokenAddress);
      const parts = [`Token: ${info.name || 'Unknown'} (${info.symbol || '?'})`, `Address: ${info.address}`];
      if (info.price) parts.push(`Price: $${info.price}`);
      if (info.marketCap) parts.push(`Market Cap: $${info.marketCap.toLocaleString()}`);
      if (info.liquidity) parts.push(`Liquidity: $${info.liquidity.toLocaleString()}`);
      if (info.change24h !== null) parts.push(`24h Change: ${info.change24h}%`);
      tokenContext = `\n\nLive token data:\n${parts.join('\n')}`;
    } catch {}
  }

  const messages = clientMessages || [{ role: 'user', content: query }];

  // Inject system prompt as first user context if using Anthropic-style messages
  const systemMsg = TRADING_SYSTEM_PROMPT + tokenContext;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    if (requestedModel.startsWith('claude')) {
      await streamAnthropicWithSystem(requestedModel, systemMsg, messages, 4096, 0.7, res);
    } else if (requestedModel.startsWith('gemini')) {
      await streamGeminiWithSystem(requestedModel, systemMsg, messages, 4096, 0.7, res);
    } else if (requestedModel.startsWith('gpt-')) {
      await streamOpenAIWithSystem(requestedModel, systemMsg, messages, 4096, 0.7, res);
    }

    usage.count++;
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Trading analysis error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

// GET /v1/trading/token/:address — Fetch token info
app.get('/v1/trading/token/:address', authenticateApiKey, async (req, res) => {
  try {
    const info = await fetchTokenInfo(req.params.address);
    res.json(info);
  } catch (err) {
    console.error('Token lookup error:', err.message);
    res.status(502).json({ error: 'lookup_failed', message: err.message });
  }
});

// Streaming helpers with system prompt injection
async function streamAnthropicWithSystem(model, systemPrompt, messages, maxTokens, temperature, res) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CONFIG.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      max_tokens: Math.min(maxTokens, 8192),
      temperature: temperature ?? 0.7,
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic ${response.status}: ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;
      try {
        const event = JSON.parse(jsonStr);
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          res.write(`data: ${JSON.stringify({ type: 'text', content: event.delta.text })}\n\n`);
        }
      } catch {}
    }
  }
}

async function streamGeminiWithSystem(model, systemPrompt, messages, maxTokens, temperature, res) {
  const geminiContents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: typeof m.content === 'string' ? m.content : m.content.map(c => c.text).join('') }],
  }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${CONFIG.GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: geminiContents,
        generationConfig: {
          maxOutputTokens: Math.min(maxTokens, 8192),
          temperature: temperature ?? 0.7,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini ${response.status}: ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr) continue;
      try {
        const data = JSON.parse(jsonStr);
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
        }
      } catch {}
    }
  }
}

async function streamOpenAIWithSystem(model, systemPrompt, messages, maxTokens, temperature, res) {
  const openaiMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: Math.min(maxTokens, 8192),
      temperature: temperature ?? 0.7,
      messages: openaiMessages,
      stream: true,
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI ${response.status}: ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;
      try {
        const data = JSON.parse(jsonStr);
        const text = data.choices?.[0]?.delta?.content;
        if (text) {
          res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
        }
      } catch {}
    }
  }
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

// ─── Admin: Treasury Agent ───────────────────────────────────
// The treasury agent pushes rate limit adjustments here

let treasuryState = {
  multiplier: 1.0,
  healthStatus: 'unknown',
  runwayDays: 0,
  dailyBudget: 0,
  treasuryBalanceUsd: 0,
  updatedAt: null,
};

function authenticateAdmin(req, res, next) {
  const key = req.headers.authorization?.split(' ')[1];
  const adminKey = process.env.ADMIN_KEY || 'dev-admin-key';
  if (key !== adminKey) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// Treasury agent pushes updated rate limits
app.post('/admin/rate-limits', authenticateAdmin, (req, res) => {
  const { multiplier, healthStatus, runwayDays, dailyBudget, treasuryBalanceUsd } = req.body;
  
  treasuryState = {
    multiplier: multiplier || 1.0,
    healthStatus: healthStatus || 'unknown',
    runwayDays: runwayDays || 0,
    dailyBudget: dailyBudget || 0,
    treasuryBalanceUsd: treasuryBalanceUsd || 0,
    updatedAt: Date.now(),
  };
  
  console.log(`[Admin] Rate limits updated: ${multiplier}x (${healthStatus}), runway: ${runwayDays} days`);
  res.json({ ok: true, applied: treasuryState });
});

// Public treasury status (for dashboard)
app.get('/treasury', (req, res) => {
  res.json(treasuryState);
});

// ─── Health ──────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', protocol: 'INFINITE', treasury: treasuryState.healthStatus });
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
