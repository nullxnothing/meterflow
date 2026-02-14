import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { Connection } from '@solana/web3.js';
import { config } from 'dotenv';
config();

import {
  generateWallet, importWallet, loadKeypair, getEncryptionKey, getSolBalance,
  getQuote, executeSwap, SOL_MINT, USDC_MINT,
  executePumpTrade, getBondingCurveState, calculatePrice, calculateBuyQuote, calculateSellQuote, getTokenPriceInfo,
  CopyTrader, createSafetyManager,
  createDCAOrder, pauseDCAOrder, resumeDCAOrder, cancelDCAOrder, getDCAOrderInfo,
  TriggerManager,
} from './trading/index.js';
import {
  isServerTool, executeTool,
  getAnthropicTools, getGeminiTools, getOpenAITools,
  SERVER_TOOL_NAMES,
} from './tools/index.js';

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
app.use(express.json({ limit: '10mb' }));

// ─── In-Memory Store (swap for Redis in production) ──────────
// For production, replace these Maps with Redis calls
const apiKeys = new Map();      // apiKey -> { wallet, tier, createdAt }
const walletKeys = new Map();   // wallet -> apiKey
const usageCounts = new Map();  // apiKey -> { date, count, tokens }
const balanceCache = new Map(); // wallet -> { balance, checkedAt }
const videoOperations = new Map(); // operationName -> { apiKey, prompt, status, result }

// ─── Trading Bot State ──────────────────────────────────────
const tradingWallets = new Map();    // apiKey → { encryptedKeypair, publicKey, createdAt }
const tradingPositions = new Map();  // apiKey → Map<mint, { amount, avgPrice, entryTime }>
const tradeHistory = new Map();      // apiKey → [{ id, action, mint, sol, tokens, sig, ts }]
const activeDCA = new Map();         // orderId → { apiKey, order }
const activeCopyTraders = new Map(); // apiKey → CopyTrader instance
const activeTriggers = new Map();    // apiKey → TriggerManager instance
const safetyManagers = new Map();    // apiKey → SafetyManager instance

// ─── Config ──────────────────────────────────────────────────
const CONFIG = {
  HELIUS_API_KEY: process.env.HELIUS_API_KEY || '',
  HELIUS_RPC_URL: process.env.HELIUS_RPC_URL || '',
  TOKEN_MINT: process.env.INFINITE_TOKEN_MINT || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  TREASURY_WALLET: process.env.TREASURY_WALLET || '',
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
  WALLET_ENCRYPTION_SECRET: process.env.WALLET_ENCRYPTION_SECRET || 'dev-encryption-secret-change-me',
};

const TRADING_TIERS = ['operator', 'architect'];
const solanaConnection = new Connection(CONFIG.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com');

function getSafetyManager(apiKey) {
  if (!safetyManagers.has(apiKey)) safetyManagers.set(apiKey, createSafetyManager());
  return safetyManagers.get(apiKey);
}

function getTriggerManager(apiKey) {
  if (!activeTriggers.has(apiKey)) activeTriggers.set(apiKey, new TriggerManager());
  return activeTriggers.get(apiKey);
}

function requireTradingTier(req, res, next) {
  const { tier } = req.infinite;
  if (!TRADING_TIERS.includes(tier)) {
    return res.status(403).json({
      error: 'tier_restricted',
      message: 'Trading bot requires Operator tier or above.',
      requiredTier: 'Operator',
      currentTier: CONFIG.TIERS[tier]?.label || tier,
    });
  }
  next();
}

function getPositions(apiKey) {
  if (!tradingPositions.has(apiKey)) tradingPositions.set(apiKey, new Map());
  return tradingPositions.get(apiKey);
}

function getHistory(apiKey) {
  if (!tradeHistory.has(apiKey)) tradeHistory.set(apiKey, []);
  return tradeHistory.get(apiKey);
}

function recordTrade(apiKey, entry) {
  const hist = getHistory(apiKey);
  hist.push({ id: `t_${Date.now()}`, ...entry, ts: Date.now() });
  if (hist.length > 1000) hist.splice(0, hist.length - 1000);
}

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

// ─── Tool Translation ────────────────────────────────────────

function translateToolsForProvider(provider, tools) {
  if (!tools || !Array.isArray(tools) || tools.length === 0) return { native: null, serverTools: [] };
  const has = (name) => tools.includes(name);

  const serverToolNames = tools.filter(t => SERVER_TOOL_NAMES.includes(t));

  if (provider === 'claude') {
    const out = [];
    if (has('web_search')) out.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 5 });
    out.push(...getAnthropicTools(serverToolNames));
    return { native: out.length ? out : null, serverTools: serverToolNames };
  }
  if (provider === 'gemini') {
    const nativeTools = [];
    if (has('web_search')) nativeTools.push({ google_search: {} });
    const customFns = getGeminiTools(serverToolNames);
    // Gemini: native tools go in tools array, custom functions go as functionDeclarations
    const combined = [...nativeTools];
    if (customFns.length > 0) combined.push({ functionDeclarations: customFns });
    return { native: combined.length ? combined : null, serverTools: serverToolNames };
  }
  if (provider === 'openai') {
    const out = [];
    if (has('web_search')) out.push({ type: 'web_search' });
    // OpenAI: server tools use Chat Completions function calling
    const fns = getOpenAITools(serverToolNames);
    out.push(...fns);
    return { native: out.length ? out : null, serverTools: serverToolNames };
  }
  return { native: null, serverTools: [] };
}

function injectImagesIntoMessages(provider, messages, images) {
  if (!images || !Array.isArray(images) || images.length === 0) return messages;
  const msgs = messages.map(m => ({ ...m }));
  const lastUserIdx = msgs.findLastIndex(m => m.role === 'user');
  if (lastUserIdx === -1) return msgs;

  const lastMsg = msgs[lastUserIdx];
  const textContent = typeof lastMsg.content === 'string' ? lastMsg.content : lastMsg.content.map(c => c.text || '').join('');

  if (provider === 'claude') {
    const blocks = images.map(img => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mimeType, data: img.data },
    }));
    blocks.push({ type: 'text', text: textContent });
    msgs[lastUserIdx] = { role: 'user', content: blocks };
  } else if (provider === 'gemini') {
    // Gemini uses inline_data parts — handled in stream function since format differs
    msgs[lastUserIdx] = {
      role: 'user',
      content: textContent,
      _images: images,
    };
  } else if (provider === 'openai') {
    const parts = images.map(img => ({
      type: 'image_url',
      image_url: { url: `data:${img.mimeType};base64,${img.data}` },
    }));
    parts.push({ type: 'text', text: textContent });
    msgs[lastUserIdx] = { role: 'user', content: parts };
  }

  return msgs;
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
  const { model, messages, max_tokens, temperature, tools, images } = req.body;
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

  const provider = getProviderForModel(requestedModel);
  const { native: translatedTools, serverTools } = translateToolsForProvider(provider, tools);
  const processedMessages = injectImagesIntoMessages(provider, messages, images);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    if (provider === 'claude') {
      await streamAnthropic(requestedModel, processedMessages, max_tokens || 4096, temperature, res, translatedTools, serverTools);
    } else if (provider === 'gemini') {
      await streamGemini(requestedModel, processedMessages, max_tokens || 4096, temperature, res, translatedTools, serverTools);
    } else if (provider === 'openai') {
      await streamOpenAI(requestedModel, processedMessages, max_tokens || 4096, temperature, res, translatedTools, serverTools);
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

async function streamAnthropic(model, messages, maxTokens, temperature, res, tools, serverTools) {
  const MAX_TOOL_LOOPS = 3;
  let loopMessages = [...messages];

  for (let loop = 0; loop <= MAX_TOOL_LOOPS; loop++) {
    const body = {
      model,
      max_tokens: Math.min(maxTokens, 8192),
      temperature: temperature ?? 0.7,
      messages: loopMessages,
      stream: true,
    };
    if (tools) body.tools = tools;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic ${response.status}: ${err}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let stopReason = null;
    const contentBlocks = [];
    let currentBlockIndex = -1;
    let currentToolInput = '';

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

          if (event.type === 'content_block_start') {
            currentBlockIndex = event.index ?? contentBlocks.length;
            const block = event.content_block || {};

            if (block.type === 'tool_use') {
              contentBlocks[currentBlockIndex] = { type: 'tool_use', id: block.id, name: block.name, input: '' };
              if (isServerTool(block.name)) {
                res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: block.name, query: '' })}\n\n`);
              }
            } else if (block.type === 'server_tool_use') {
              res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: 'web_search', query: '' })}\n\n`);
              contentBlocks[currentBlockIndex] = { type: 'server_tool_use' };
            } else if (block.type === 'web_search_tool_result') {
              const sources = (block.content || [])
                .filter(c => c.type === 'web_search_result')
                .slice(0, 6)
                .map(c => ({ title: c.title || '', url: c.url || '', snippet: c.encrypted_content ? '' : (c.page_content || '').slice(0, 120) }));
              res.write(`data: ${JSON.stringify({ type: 'tool_result', tool: 'web_search', sources })}\n\n`);
              contentBlocks[currentBlockIndex] = { type: 'web_search_tool_result' };
            } else if (block.type === 'text') {
              contentBlocks[currentBlockIndex] = { type: 'text', text: '' };
            }
          }

          if (event.type === 'content_block_delta') {
            if (event.delta?.type === 'text_delta') {
              res.write(`data: ${JSON.stringify({ type: 'text', content: event.delta.text })}\n\n`);
              if (contentBlocks[currentBlockIndex]?.type === 'text') {
                contentBlocks[currentBlockIndex].text += event.delta.text;
              }
            } else if (event.delta?.type === 'input_json_delta') {
              if (contentBlocks[currentBlockIndex]?.type === 'tool_use') {
                contentBlocks[currentBlockIndex].input += event.delta.partial_json || '';
              }
            }
          }

          if (event.type === 'message_delta') {
            stopReason = event.delta?.stop_reason || null;
          }
        } catch {}
      }
    }

    // Check if we need to execute server tools
    const toolUseBlocks = contentBlocks.filter(b => b?.type === 'tool_use' && isServerTool(b.name));

    if (stopReason !== 'tool_use' || toolUseBlocks.length === 0 || loop === MAX_TOOL_LOOPS) {
      break; // Done — no more tool calls or hit max loops
    }

    // Execute server tools and build continuation
    const assistantContent = contentBlocks
      .filter(b => b && (b.type === 'text' || b.type === 'tool_use'))
      .map(b => {
        if (b.type === 'text') return { type: 'text', text: b.text };
        if (b.type === 'tool_use') {
          let input = {};
          try { input = JSON.parse(b.input); } catch {}
          return { type: 'tool_use', id: b.id, name: b.name, input };
        }
        return null;
      })
      .filter(Boolean);

    const toolResults = [];
    for (const block of toolUseBlocks) {
      let input = {};
      try { input = JSON.parse(block.input); } catch {}
      const result = await executeTool(block.name, input);
      res.write(`data: ${JSON.stringify({ type: 'tool_result', tool: block.name, data: result })}\n\n`);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    loopMessages = [
      ...loopMessages,
      { role: 'assistant', content: assistantContent },
      ...toolResults.map(tr => ({ role: 'user', content: [tr] })),
    ];
  }
}

async function streamGemini(model, messages, maxTokens, temperature, res, tools, serverTools) {
  const MAX_TOOL_LOOPS = 3;

  function buildGeminiContents(msgs) {
    return msgs.map(m => {
      const parts = [];
      if (m._images) {
        for (const img of m._images) {
          parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
        }
      }
      if (m._functionResponses) {
        for (const fr of m._functionResponses) {
          parts.push({ functionResponse: fr });
        }
        return { role: 'user', parts };
      }
      if (m._functionCalls) {
        for (const fc of m._functionCalls) {
          parts.push({ functionCall: fc });
        }
        return { role: 'model', parts };
      }
      const text = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.map(c => c.text || '').join('') : '');
      if (text) parts.push({ text });
      return { role: m.role === 'assistant' ? 'model' : 'user', parts };
    });
  }

  let loopMessages = [...messages];

  for (let loop = 0; loop <= MAX_TOOL_LOOPS; loop++) {
    const geminiContents = buildGeminiContents(loopMessages);

    const body = {
      contents: geminiContents,
      generationConfig: {
        maxOutputTokens: Math.min(maxTokens, 8192),
        temperature: temperature ?? 0.7,
      },
    };
    if (tools) body.tools = tools;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${CONFIG.GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini ${response.status}: ${err}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let emittedGroundingStart = false;
    const functionCalls = [];
    let collectedText = '';

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
          const parts = data.candidates?.[0]?.content?.parts || [];

          for (const part of parts) {
            if (part.text) {
              collectedText += part.text;
              res.write(`data: ${JSON.stringify({ type: 'text', content: part.text })}\n\n`);
            }
            if (part.functionCall && isServerTool(part.functionCall.name)) {
              res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: part.functionCall.name, query: '' })}\n\n`);
              functionCalls.push(part.functionCall);
            }
          }

          // Grounding metadata from Google Search
          const grounding = data.candidates?.[0]?.groundingMetadata;
          if (grounding) {
            if (!emittedGroundingStart && grounding.searchEntryPoint) {
              const query = grounding.webSearchQueries?.[0] || '';
              res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: 'web_search', query })}\n\n`);
              emittedGroundingStart = true;
            }
            const chunks = grounding.groundingChunks || [];
            if (chunks.length > 0) {
              const sources = chunks.slice(0, 6).map(c => ({
                title: c.web?.title || '',
                url: c.web?.uri || '',
                snippet: '',
              }));
              res.write(`data: ${JSON.stringify({ type: 'tool_result', tool: 'web_search', sources })}\n\n`);
            }
          }
        } catch {}
      }
    }

    if (functionCalls.length === 0 || loop === MAX_TOOL_LOOPS) break;

    // Execute server tools
    const functionResponses = [];
    for (const fc of functionCalls) {
      const result = await executeTool(fc.name, fc.args || {});
      res.write(`data: ${JSON.stringify({ type: 'tool_result', tool: fc.name, data: result })}\n\n`);
      functionResponses.push({ name: fc.name, response: result });
    }

    // Build continuation messages
    loopMessages = [
      ...loopMessages,
      { role: 'assistant', content: '', _functionCalls: functionCalls.map(fc => ({ name: fc.name, args: fc.args || {} })) },
      { role: 'user', content: '', _functionResponses: functionResponses },
    ];
  }
}

async function streamOpenAI(model, messages, maxTokens, temperature, res, tools, serverTools) {
  const hasServerTools = serverTools && serverTools.length > 0;
  const hasNativeToolsOnly = tools && tools.length > 0 && !hasServerTools;

  if (hasServerTools) {
    // Use Chat Completions with function calling for server tools
    await streamOpenAIChatWithTools(model, messages, maxTokens, temperature, res, tools, serverTools);
  } else if (hasNativeToolsOnly) {
    // Use Responses API for native-only tools (web_search)
    await streamOpenAIResponses(model, messages, maxTokens, temperature, res, tools);
  } else {
    await streamOpenAIChatCompletions(model, messages, maxTokens, temperature, res);
  }
}

async function streamOpenAIChatWithTools(model, messages, maxTokens, temperature, res, tools, serverTools) {
  const MAX_TOOL_LOOPS = 3;
  // Split tools: native web_search uses Responses API format, function tools use Chat Completions format
  const functionTools = tools.filter(t => t.type === 'function');
  const hasNativeWebSearch = tools.some(t => t.type === 'web_search');

  let loopMessages = [...messages];

  for (let loop = 0; loop <= MAX_TOOL_LOOPS; loop++) {
    const body = {
      model,
      max_tokens: Math.min(maxTokens, 8192),
      temperature: temperature ?? 0.7,
      messages: loopMessages,
      stream: true,
    };
    if (functionTools.length > 0) body.tools = functionTools;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI ${response.status}: ${err}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finishReason = null;
    const toolCallAccumulator = {};
    let collectedText = '';

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
          const choice = data.choices?.[0];
          if (!choice) continue;

          if (choice.delta?.content) {
            collectedText += choice.delta.content;
            res.write(`data: ${JSON.stringify({ type: 'text', content: choice.delta.content })}\n\n`);
          }

          // Accumulate tool calls from deltas
          if (choice.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              const idx = tc.index;
              if (!toolCallAccumulator[idx]) {
                toolCallAccumulator[idx] = { id: tc.id || '', name: tc.function?.name || '', arguments: '' };
                if (tc.function?.name && isServerTool(tc.function.name)) {
                  res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: tc.function.name, query: '' })}\n\n`);
                }
              }
              if (tc.id) toolCallAccumulator[idx].id = tc.id;
              if (tc.function?.name) toolCallAccumulator[idx].name = tc.function.name;
              if (tc.function?.arguments) toolCallAccumulator[idx].arguments += tc.function.arguments;
            }
          }

          if (choice.finish_reason) finishReason = choice.finish_reason;
        } catch {}
      }
    }

    const toolCalls = Object.values(toolCallAccumulator).filter(tc => isServerTool(tc.name));

    if (finishReason !== 'tool_calls' || toolCalls.length === 0 || loop === MAX_TOOL_LOOPS) break;

    // Execute server tools
    const assistantMsg = { role: 'assistant', content: collectedText || null, tool_calls: Object.values(toolCallAccumulator).map(tc => ({
      id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments },
    })) };

    const toolResultMsgs = [];
    for (const tc of toolCalls) {
      let args = {};
      try { args = JSON.parse(tc.arguments); } catch {}
      const result = await executeTool(tc.name, args);
      res.write(`data: ${JSON.stringify({ type: 'tool_result', tool: tc.name, data: result })}\n\n`);
      toolResultMsgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }

    loopMessages = [...loopMessages, assistantMsg, ...toolResultMsgs];
  }
}

async function streamOpenAIChatCompletions(model, messages, maxTokens, temperature, res) {
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

async function streamOpenAIResponses(model, messages, maxTokens, temperature, res, tools) {
  // Convert chat messages to Responses API input format
  const input = messages.map(m => ({ role: m.role, content: m.content }));

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_output_tokens: Math.min(maxTokens, 8192),
      temperature: temperature ?? 0.7,
      input,
      tools,
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
        const event = JSON.parse(jsonStr);

        // Web search started
        if (event.type === 'response.web_search_call.searching') {
          res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: 'web_search', query: '' })}\n\n`);
        }

        // Text delta
        if (event.type === 'response.output_text.delta') {
          res.write(`data: ${JSON.stringify({ type: 'text', content: event.delta || '' })}\n\n`);
        }

        // Text done — extract URL citations from annotations
        if (event.type === 'response.output_text.done') {
          const annotations = event.annotations || [];
          const urlCites = annotations.filter(a => a.type === 'url_citation');
          if (urlCites.length > 0) {
            const sources = urlCites.slice(0, 6).map(a => ({
              title: a.title || a.url || '',
              url: a.url || '',
              snippet: '',
            }));
            res.write(`data: ${JSON.stringify({ type: 'tool_result', tool: 'web_search', sources })}\n\n`);
          }
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

  if (!PROVIDER_AVAILABLE.gemini) {
    return res.status(503).json({
      error: 'provider_not_configured',
      message: 'Image generation is coming soon. Gemini API will be activated after token launch.',
    });
  }

  if (!prompt) {
    return res.status(400).json({ error: 'invalid_request', message: 'prompt is required' });
  }

  try {
    const imageModel = process.env.IMAGE_MODEL || 'gemini-2.5-flash-image';

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

  if (!PROVIDER_AVAILABLE.gemini) {
    return res.status(503).json({
      error: 'provider_not_configured',
      message: 'Video generation is coming soon. Google Veo 2 will be activated after token launch.',
    });
  }

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
      'https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:predictLongRunning',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': CONFIG.GOOGLE_API_KEY,
        },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            aspectRatio: aspectRatio || '16:9',
            resolution: '720p',
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

// Helper: fetch raw operation status from Google
async function fetchVeoOperation(operationName) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
    { headers: { 'x-goog-api-key': CONFIG.GOOGLE_API_KEY } }
  );
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Veo status ${response.status}: ${err}`);
  }
  return response.json();
}

// Helper: extract video object from Google's response (handles multiple formats)
function extractVideoFromResponse(data) {
  // Try all known response structures
  return data.response?.generatedVideos?.[0]?.video
    || data.response?.generateVideoResponse?.generatedSamples?.[0]?.video
    || data.response?.videos?.[0]
    || null;
}

// GET /v1/video/status/* — Poll video generation status
app.get('/v1/video/status/*', authenticateApiKey, async (req, res) => {
  const operationName = req.params[0];

  try {
    const data = await fetchVeoOperation(operationName);

    if (data.done) {
      if (data.error) {
        videoOperations.set(operationName, { ...videoOperations.get(operationName), status: 'failed', error: data.error.message });
        return res.json({ status: 'failed', error: data.error.message });
      }

      const video = extractVideoFromResponse(data);

      // Log the full response structure for debugging
      const responseKeys = data.response ? Object.keys(data.response) : [];
      console.log('[Veo] Operation complete. Response keys:', responseKeys);
      console.log('[Veo] Extracted video:', video ? JSON.stringify(video).slice(0, 300) : 'null');
      if (!video) {
        console.error('[Veo] Full response:', JSON.stringify(data.response).slice(0, 1000));
      }

      if (!video?.uri) {
        videoOperations.set(operationName, { ...videoOperations.get(operationName), status: 'failed', error: 'No video in response' });
        return res.json({ status: 'failed', error: 'Video generation completed but no video was returned.' });
      }

      videoOperations.set(operationName, { ...videoOperations.get(operationName), status: 'complete', video });

      return res.json({
        status: 'complete',
        video: { uri: `/v1/video/download/${operationName}`, mimeType: video.mimeType || 'video/mp4' },
      });
    }

    res.json({ status: 'pending', metadata: data.metadata || null });
  } catch (err) {
    console.error('Video status error:', err.message);
    res.status(502).json({ error: 'upstream_error', message: err.message });
  }
});

// GET /v1/video/debug/* — Debug: show raw Google response for an operation
app.get('/v1/video/debug/*', authenticateAdmin, async (req, res) => {
  const operationName = req.params[0];
  try {
    const data = await fetchVeoOperation(operationName);
    const video = extractVideoFromResponse(data);
    res.json({
      raw: data,
      extractedVideo: video,
      responseKeys: data.response ? Object.keys(data.response) : [],
      inMemory: videoOperations.get(operationName) || null,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /v1/video/download/* — Proxy video file download (hides API key)
app.get('/v1/video/download/*', async (req, res) => {
  const operationName = req.params[0];
  const op = videoOperations.get(operationName);

  if (!op?.video?.uri) {
    return res.status(404).json({ error: 'not_found', message: 'Video not found or still processing.' });
  }

  try {
    const videoRes = await fetch(op.video.uri, {
      headers: { 'x-goog-api-key': CONFIG.GOOGLE_API_KEY },
      redirect: 'follow',
    });

    if (!videoRes.ok) {
      const errBody = await videoRes.text().catch(() => '');
      console.error('Video download upstream error:', videoRes.status, errBody.slice(0, 200));
      return res.status(502).json({ error: 'download_failed', message: `Upstream returned ${videoRes.status}` });
    }

    res.setHeader('Content-Type', videoRes.headers.get('content-type') || 'video/mp4');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const contentLength = videoRes.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    const arrayBuffer = await videoRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('Video download error:', err.message);
    res.status(502).json({ error: 'download_failed', message: err.message });
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

// ─── Routes: Trading Bot ─────────────────────────────────────

// POST /v1/trading/wallet/create
app.post('/v1/trading/wallet/create', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  if (tradingWallets.has(apiKey)) {
    const existing = tradingWallets.get(apiKey);
    return res.json({ publicKey: existing.publicKey, message: 'Wallet already exists.' });
  }
  const encKey = getEncryptionKey(CONFIG.WALLET_ENCRYPTION_SECRET, apiKey);
  const wallet = generateWallet(encKey);
  tradingWallets.set(apiKey, wallet);
  res.json({ publicKey: wallet.publicKey, message: 'Burner wallet created. Fund it with SOL to start trading.' });
});

// POST /v1/trading/wallet/import
app.post('/v1/trading/wallet/import', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const { privateKey } = req.body;
  if (!privateKey) return res.status(400).json({ error: 'missing_field', message: 'privateKey is required' });
  try {
    const encKey = getEncryptionKey(CONFIG.WALLET_ENCRYPTION_SECRET, apiKey);
    const wallet = importWallet(privateKey, encKey);
    tradingWallets.set(apiKey, wallet);
    res.json({ publicKey: wallet.publicKey, message: 'Wallet imported.' });
  } catch (err) {
    res.status(400).json({ error: 'import_failed', message: err.message });
  }
});

// GET /v1/trading/wallet/info
app.get('/v1/trading/wallet/info', authenticateApiKey, requireTradingTier, async (req, res) => {
  const { apiKey } = req.infinite;
  const w = tradingWallets.get(apiKey);
  if (!w) return res.status(404).json({ error: 'no_wallet', message: 'Create a wallet first via POST /v1/trading/wallet/create' });
  try {
    const solBalance = await getSolBalance(solanaConnection, w.publicKey);
    const positions = [...getPositions(apiKey).entries()].map(([mint, p]) => ({ mint, ...p }));
    res.json({ publicKey: w.publicKey, solBalance, positions, createdAt: w.createdAt });
  } catch (err) {
    res.status(502).json({ error: 'balance_check_failed', message: err.message });
  }
});

// POST /v1/trading/wallet/export
app.post('/v1/trading/wallet/export', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const { confirm } = req.body;
  if (!confirm) return res.status(400).json({ error: 'confirmation_required', message: 'Set { confirm: true } to export private key.' });
  const w = tradingWallets.get(apiKey);
  if (!w) return res.status(404).json({ error: 'no_wallet', message: 'No wallet found.' });
  try {
    const encKey = getEncryptionKey(CONFIG.WALLET_ENCRYPTION_SECRET, apiKey);
    const keypair = loadKeypair(w.encryptedKeypair, encKey);
    const privateKey = Buffer.from(keypair.secretKey).toString('base64');
    res.json({ publicKey: w.publicKey, privateKey });
  } catch (err) {
    res.status(500).json({ error: 'export_failed', message: err.message });
  }
});

// POST /v1/trading/swap/quote
app.post('/v1/trading/swap/quote', authenticateApiKey, requireTradingTier, async (req, res) => {
  const { inputMint, outputMint, amount, slippageBps } = req.body;
  if (!inputMint || !outputMint || !amount) {
    return res.status(400).json({ error: 'missing_fields', message: 'inputMint, outputMint, amount required' });
  }
  try {
    const quote = await getQuote({ inputMint, outputMint, amount: String(amount), slippageBps });
    res.json(quote);
  } catch (err) {
    res.status(502).json({ error: 'quote_failed', message: err.message });
  }
});

// POST /v1/trading/swap
app.post('/v1/trading/swap', authenticateApiKey, requireTradingTier, async (req, res) => {
  const { apiKey } = req.infinite;
  const { inputMint, outputMint, amount, slippageBps, priorityFeeLamports } = req.body;
  if (!inputMint || !outputMint || !amount) {
    return res.status(400).json({ error: 'missing_fields', message: 'inputMint, outputMint, amount required' });
  }
  const w = tradingWallets.get(apiKey);
  if (!w) return res.status(404).json({ error: 'no_wallet', message: 'Create a wallet first.' });

  const safety = getSafetyManager(apiKey);
  const solAmount = inputMint === SOL_MINT ? Number(amount) / 1e9 : 0;
  const check = safety.validateTrade({ action: 'buy', solAmount, mint: outputMint });
  if (!check.allowed) return res.status(403).json({ error: 'safety_blocked', message: check.reason });

  try {
    const encKey = getEncryptionKey(CONFIG.WALLET_ENCRYPTION_SECRET, apiKey);
    const keypair = loadKeypair(w.encryptedKeypair, encKey);
    const quote = await getQuote({ inputMint, outputMint, amount: String(amount), slippageBps });
    const result = await executeSwap(solanaConnection, keypair, quote, { priorityFeeLamports });
    recordTrade(apiKey, { action: 'swap', inputMint, outputMint, amount, sig: result.signature });
    res.json({ signature: result.signature, inputAmount: result.inputAmount, outputAmount: result.outputAmount });
  } catch (err) {
    res.status(502).json({ error: 'swap_failed', message: err.message });
  }
});

// POST /v1/trading/pump/buy
app.post('/v1/trading/pump/buy', authenticateApiKey, requireTradingTier, async (req, res) => {
  const { apiKey } = req.infinite;
  const { mint, amount, denominatedInSol = true, slippage, priorityFee, pool } = req.body;
  if (!mint || amount === undefined) return res.status(400).json({ error: 'missing_fields', message: 'mint, amount required' });
  const w = tradingWallets.get(apiKey);
  if (!w) return res.status(404).json({ error: 'no_wallet', message: 'Create a wallet first.' });

  const safety = getSafetyManager(apiKey);
  const check = safety.validateTrade({ action: 'buy', solAmount: denominatedInSol ? amount : 0, mint });
  if (!check.allowed) return res.status(403).json({ error: 'safety_blocked', message: check.reason });

  try {
    const encKey = getEncryptionKey(CONFIG.WALLET_ENCRYPTION_SECRET, apiKey);
    const keypair = loadKeypair(w.encryptedKeypair, encKey);
    const result = await executePumpTrade(solanaConnection, keypair, { mint, action: 'buy', amount, denominatedInSol, slippage, priorityFee, pool });
    recordTrade(apiKey, { action: 'pump_buy', mint, amount, sig: result.signature });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'pump_buy_failed', message: err.message });
  }
});

// POST /v1/trading/pump/sell
app.post('/v1/trading/pump/sell', authenticateApiKey, requireTradingTier, async (req, res) => {
  const { apiKey } = req.infinite;
  const { mint, amount, denominatedInSol = false, slippage, priorityFee, pool } = req.body;
  if (!mint || amount === undefined) return res.status(400).json({ error: 'missing_fields', message: 'mint, amount required' });
  const w = tradingWallets.get(apiKey);
  if (!w) return res.status(404).json({ error: 'no_wallet', message: 'Create a wallet first.' });

  try {
    const encKey = getEncryptionKey(CONFIG.WALLET_ENCRYPTION_SECRET, apiKey);
    const keypair = loadKeypair(w.encryptedKeypair, encKey);
    const result = await executePumpTrade(solanaConnection, keypair, { mint, action: 'sell', amount, denominatedInSol, slippage, priorityFee, pool });
    recordTrade(apiKey, { action: 'pump_sell', mint, amount, sig: result.signature });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'pump_sell_failed', message: err.message });
  }
});

// POST /v1/trading/dca/create
app.post('/v1/trading/dca/create', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const { inputMint, outputMint, totalAmountLamports, amountPerCycleLamports, cycleIntervalMs, slippageBps, maxCycles, maxPrice } = req.body;
  if (!inputMint || !outputMint || !totalAmountLamports || !amountPerCycleLamports || !cycleIntervalMs) {
    return res.status(400).json({ error: 'missing_fields', message: 'inputMint, outputMint, totalAmountLamports, amountPerCycleLamports, cycleIntervalMs required' });
  }
  const w = tradingWallets.get(apiKey);
  if (!w) return res.status(404).json({ error: 'no_wallet', message: 'Create a wallet first.' });

  try {
    const encKey = getEncryptionKey(CONFIG.WALLET_ENCRYPTION_SECRET, apiKey);
    const keypair = loadKeypair(w.encryptedKeypair, encKey);
    const order = createDCAOrder(solanaConnection, keypair, { inputMint, outputMint, totalAmountLamports, amountPerCycleLamports, cycleIntervalMs, slippageBps, maxCycles, maxPrice });
    activeDCA.set(order.id, { apiKey, order });
    res.json(getDCAOrderInfo(order));
  } catch (err) {
    res.status(500).json({ error: 'dca_create_failed', message: err.message });
  }
});

// GET /v1/trading/dca/orders
app.get('/v1/trading/dca/orders', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const orders = [...activeDCA.values()]
    .filter(d => d.apiKey === apiKey)
    .map(d => getDCAOrderInfo(d.order));
  res.json(orders);
});

// POST /v1/trading/dca/:id/cancel
app.post('/v1/trading/dca/:id/cancel', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const entry = activeDCA.get(req.params.id);
  if (!entry || entry.apiKey !== apiKey) return res.status(404).json({ error: 'not_found', message: 'DCA order not found.' });
  cancelDCAOrder(entry.order);
  res.json({ id: req.params.id, status: 'cancelled' });
});

// POST /v1/trading/copy/follow
app.post('/v1/trading/copy/follow', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const { address, name, multiplier, maxPositionSol, copyBuys, copySells, slippageBps, delayMs } = req.body;
  if (!address) return res.status(400).json({ error: 'missing_fields', message: 'address required' });

  const w = tradingWallets.get(apiKey);
  if (!w) return res.status(404).json({ error: 'no_wallet', message: 'Create a wallet first.' });

  let ct = activeCopyTraders.get(apiKey);
  if (!ct) {
    const encKey = getEncryptionKey(CONFIG.WALLET_ENCRYPTION_SECRET, apiKey);
    const keypair = loadKeypair(w.encryptedKeypair, encKey);
    ct = new CopyTrader(solanaConnection, keypair, { onTrade: (data) => {
      recordTrade(apiKey, { action: 'copy_' + data.trade?.action, mint: data.trade?.mint, sig: data.result?.signature });
    }});
    activeCopyTraders.set(apiKey, ct);
  }

  const target = ct.addTarget(address, { name, multiplier, maxPositionSol, copyBuys, copySells, slippageBps, delayMs });
  res.json(target);
});

// POST /v1/trading/copy/unfollow
app.post('/v1/trading/copy/unfollow', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const { targetId } = req.body;
  if (!targetId) return res.status(400).json({ error: 'missing_fields', message: 'targetId required' });
  const ct = activeCopyTraders.get(apiKey);
  if (!ct) return res.status(404).json({ error: 'not_found', message: 'No copy trader active.' });
  ct.removeTarget(targetId);
  res.json({ removed: targetId });
});

// GET /v1/trading/copy/targets
app.get('/v1/trading/copy/targets', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const ct = activeCopyTraders.get(apiKey);
  if (!ct) return res.json({ targets: [], stats: { totalTargets: 0, activeTargets: 0, totalTradesCopied: 0, successRate: '0.0' } });
  res.json({ targets: ct.listTargets(), stats: ct.getStats() });
});

// POST /v1/trading/copy/start
app.post('/v1/trading/copy/start', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const ct = activeCopyTraders.get(apiKey);
  if (!ct) return res.status(404).json({ error: 'not_found', message: 'Follow a wallet first.' });
  ct.start();
  res.json({ status: 'running', targets: ct.listTargets().length });
});

// POST /v1/trading/copy/stop
app.post('/v1/trading/copy/stop', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const ct = activeCopyTraders.get(apiKey);
  if (!ct) return res.status(404).json({ error: 'not_found', message: 'No copy trader active.' });
  ct.stop();
  res.json({ status: 'stopped' });
});

// POST /v1/trading/trigger/create
app.post('/v1/trading/trigger/create', authenticateApiKey, requireTradingTier, async (req, res) => {
  const { apiKey } = req.infinite;
  const { mint, condition, order, expiresAt, oneShot } = req.body;
  if (!mint || !condition || !order) return res.status(400).json({ error: 'missing_fields', message: 'mint, condition, order required' });

  const w = tradingWallets.get(apiKey);
  if (!w) return res.status(404).json({ error: 'no_wallet', message: 'Create a wallet first.' });

  const tm = getTriggerManager(apiKey);

  // Wire executor if not set
  if (!tm.executeFn) {
    const encKey = getEncryptionKey(CONFIG.WALLET_ENCRYPTION_SECRET, apiKey);
    const keypair = loadKeypair(w.encryptedKeypair, encKey);
    tm.setExecutor(async (trigger) => {
      const { action, inputMint, outputMint, amount, slippageBps } = trigger.order;
      const quote = await getQuote({ inputMint, outputMint, amount: String(amount), slippageBps: slippageBps || 300 });
      const result = await executeSwap(solanaConnection, keypair, quote);
      recordTrade(apiKey, { action: `trigger_${action}`, mint: trigger.mint, sig: result.signature });
      return { signature: result.signature };
    });
  }

  const trigger = tm.create({ mint, condition, order, expiresAt, oneShot });
  res.json(trigger);
});

// GET /v1/trading/trigger/list
app.get('/v1/trading/trigger/list', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const tm = activeTriggers.get(apiKey);
  if (!tm) return res.json([]);
  res.json(tm.list());
});

// POST /v1/trading/trigger/:id/cancel
app.post('/v1/trading/trigger/:id/cancel', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const tm = activeTriggers.get(apiKey);
  if (!tm) return res.status(404).json({ error: 'not_found', message: 'No triggers active.' });
  tm.cancel(req.params.id);
  res.json({ id: req.params.id, status: 'cancelled' });
});

// GET /v1/trading/safety/status
app.get('/v1/trading/safety/status', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const safety = getSafetyManager(apiKey);
  res.json(safety.getState());
});

// POST /v1/trading/safety/kill
app.post('/v1/trading/safety/kill', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const { reason } = req.body;

  // Kill all bots for this user
  const safety = getSafetyManager(apiKey);
  safety.killSwitch(reason || 'Manual kill switch from dashboard');

  // Stop copy trader
  const ct = activeCopyTraders.get(apiKey);
  if (ct) ct.stop();

  // Stop DCA orders
  for (const [id, entry] of activeDCA) {
    if (entry.apiKey === apiKey) cancelDCAOrder(entry.order);
  }

  // Stop triggers
  const tm = activeTriggers.get(apiKey);
  if (tm) tm.stopAll();

  res.json({ killed: true, message: 'All trading bots stopped.' });
});

// POST /v1/trading/safety/resume
app.post('/v1/trading/safety/resume', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const safety = getSafetyManager(apiKey);
  const resumed = safety.resumeTrading();
  res.json({ resumed, state: safety.getState() });
});

// GET /v1/trading/portfolio — all SPL token holdings + SOL balance with live prices
app.get('/v1/trading/portfolio', authenticateApiKey, requireTradingTier, async (req, res) => {
  const { apiKey } = req.infinite;
  const w = tradingWallets.get(apiKey);
  if (!w) return res.status(404).json({ error: 'no_wallet' });
  try {
    const solBalance = await getSolBalance(solanaConnection, w.publicKey);

    // Fetch all token accounts for this wallet
    const taRes = await fetch(`https://mainnet.helius-rpc.com/?api-key=${CONFIG.HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 'portfolio',
        method: 'getTokenAccountsByOwner',
        params: [w.publicKey, { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' }, { encoding: 'jsonParsed' }]
      })
    });
    const taData = await taRes.json();
    const holdings = [];
    const mints = [];

    if (taData.result?.value) {
      for (const acct of taData.result.value) {
        const info = acct.account.data.parsed.info;
        const amount = parseFloat(info.tokenAmount.uiAmountString || '0');
        if (amount <= 0) continue;
        holdings.push({
          mint: info.mint,
          amount,
          decimals: info.tokenAmount.decimals,
        });
        mints.push(info.mint);
      }
    }

    // Fetch prices for all held tokens via Jupiter
    let prices = {};
    if (mints.length > 0) {
      try {
        const priceRes = await fetch(`https://api.jup.ag/price/v2?ids=${mints.join(',')}`);
        const priceData = await priceRes.json();
        prices = priceData.data || {};
      } catch {}
    }

    // Enrich holdings with price data
    let totalValueUsd = solBalance * (prices['So11111111111111111111111111111111111111112']?.price || 0);
    const enriched = holdings.map(h => {
      const priceUsd = parseFloat(prices[h.mint]?.price || 0);
      const valueUsd = h.amount * priceUsd;
      totalValueUsd += valueUsd;
      return { ...h, priceUsd, valueUsd };
    }).sort((a, b) => b.valueUsd - a.valueUsd);

    // Get SOL price
    let solPriceUsd = 0;
    try {
      const solPriceRes = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
      const solPriceData = await solPriceRes.json();
      solPriceUsd = parseFloat(solPriceData.data?.['So11111111111111111111111111111111111111112']?.price || 0);
    } catch {}

    res.json({
      publicKey: w.publicKey,
      solBalance,
      solPriceUsd,
      solValueUsd: solBalance * solPriceUsd,
      holdings: enriched,
      totalValueUsd: (solBalance * solPriceUsd) + enriched.reduce((s, h) => s + h.valueUsd, 0),
    });
  } catch (err) {
    res.status(502).json({ error: 'portfolio_fetch_failed', message: err.message });
  }
});

// GET /v1/trading/positions
app.get('/v1/trading/positions', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const positions = [...getPositions(apiKey).entries()].map(([mint, p]) => ({ mint, ...p }));
  res.json(positions);
});

// GET /v1/trading/history
app.get('/v1/trading/history', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const limit = parseInt(req.query.limit) || 100;
  const hist = getHistory(apiKey);
  res.json(hist.slice(-limit));
});

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

// ─── Treasury Balance ────────────────────────────────────────

const treasuryBalanceCache = { sol: 0, usd: 0, solPrice: 0, checkedAt: 0 };
const TREASURY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getTreasuryBalance() {
  if (!CONFIG.TREASURY_WALLET || !CONFIG.HELIUS_API_KEY) {
    return treasuryBalanceCache;
  }

  if (Date.now() - treasuryBalanceCache.checkedAt < TREASURY_CACHE_TTL) {
    return treasuryBalanceCache;
  }

  try {
    // Fetch SOL balance and price in parallel
    const [balanceRes, priceRes] = await Promise.allSettled([
      fetch(`https://mainnet.helius-rpc.com/?api-key=${CONFIG.HELIUS_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 'treasury-balance',
          method: 'getBalance',
          params: [CONFIG.TREASURY_WALLET]
        })
      }).then(r => r.json()),
      fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112')
        .then(r => r.json()),
    ]);

    if (balanceRes.status === 'fulfilled' && balanceRes.value.result?.value !== undefined) {
      const lamports = balanceRes.value.result.value;
      treasuryBalanceCache.sol = lamports / 1_000_000_000;
    }

    if (priceRes.status === 'fulfilled') {
      const price = parseFloat(priceRes.value?.data?.['So11111111111111111111111111111111111111112']?.price);
      if (price > 0) treasuryBalanceCache.solPrice = price;
    }

    treasuryBalanceCache.usd = treasuryBalanceCache.sol * treasuryBalanceCache.solPrice;
    treasuryBalanceCache.checkedAt = Date.now();
  } catch (err) {
    console.error('[Treasury] Balance check failed:', err.message);
  }

  return treasuryBalanceCache;
}

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
app.get('/treasury', async (req, res) => {
  const balance = await getTreasuryBalance();
  res.json({
    ...treasuryState,
    treasuryBalanceSol: balance.sol,
    treasuryBalanceUsd: balance.usd,
    solPrice: balance.solPrice,
    wallet: CONFIG.TREASURY_WALLET ? CONFIG.TREASURY_WALLET.slice(0, 8) + '...' : null,
  });
});

// ─── Provider Status ─────────────────────────────────────────

app.get('/providers', (req, res) => {
  res.json({
    claude: PROVIDER_AVAILABLE.claude,
    gemini: PROVIDER_AVAILABLE.gemini,
    openai: PROVIDER_AVAILABLE.openai,
  });
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
