import { config } from 'dotenv';
import { Connection } from '@solana/web3.js';
config();

function cleanEnv(value) {
  return String(value || '').trim();
}

function configuredTokenMint() {
  const mint = cleanEnv(process.env.METERFLOW_TOKEN_CA) || cleanEnv(process.env.METERFLOW_TOKEN_MINT);
  return ['PASTE_YOUR_TOKEN_MINT_HERE', 'TBA', 'COMING_SOON'].includes(mint.toUpperCase()) ? '' : mint;
}

const CONFIG = {
  HELIUS_API_KEY: cleanEnv(process.env.HELIUS_API_KEY),
  HELIUS_RPC_URL: cleanEnv(process.env.HELIUS_RPC_URL),
  TOKEN_MINT: configuredTokenMint(),
  TOKEN_NAME: cleanEnv(process.env.METERFLOW_TOKEN_NAME) || 'Meterflow',
  TOKEN_SYMBOL: cleanEnv(process.env.METERFLOW_TOKEN_SYMBOL) || 'MFLOW',
  TOKEN_SWAP_URL: cleanEnv(process.env.METERFLOW_TOKEN_SWAP_URL),
  PROTOCOL_FEE_BPS: parseInt(process.env.METERFLOW_PROTOCOL_FEE_BPS || '100', 10),
  HOLDER_PROTOCOL_FEE_BPS: parseInt(process.env.METERFLOW_HOLDER_PROTOCOL_FEE_BPS || '0', 10),
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  JUPITER_API_KEY: process.env.JUPITER_API_KEY || '',
  TREASURY_WALLET: cleanEnv(process.env.SETTLEMENT_WALLET) || cleanEnv(process.env.TREASURY_WALLET),
  API_KEY_SECRET: process.env.API_KEY_SECRET || 'dev-secret-change-me',
  TIERS: {
    alpha: {
      min: parseInt(process.env.TIER_ALPHA_MIN || '10000000'),
      dailyLimit: parseInt(process.env.TIER_ALPHA_DAILY_LIMIT || '999999'),
      models: ['auto', 'claude-sonnet-4-6', 'claude-opus-4-6', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gpt-4o', 'gpt-4o-mini'],
      label: 'Alpha'
    },
    architect: {
      min: parseInt(process.env.TIER_ARCHITECT_MIN || '1000000'),
      dailyLimit: parseInt(process.env.TIER_ARCHITECT_DAILY_LIMIT || '999999'),
      models: ['auto', 'claude-sonnet-4-6', 'claude-opus-4-6', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gpt-4o', 'gpt-4o-mini'],
      label: 'Architect'
    },
    operator: {
      min: parseInt(process.env.TIER_OPERATOR_MIN || '100000'),
      dailyLimit: parseInt(process.env.TIER_OPERATOR_DAILY_LIMIT || '10000'),
      models: ['auto', 'claude-sonnet-4-6', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gpt-4o', 'gpt-4o-mini'],
      label: 'Operator'
    },
    signal: {
      min: parseInt(process.env.TIER_SIGNAL_MIN || '10000'),
      dailyLimit: parseInt(process.env.TIER_SIGNAL_DAILY_LIMIT || '1000'),
      models: ['auto', 'claude-sonnet-4-6', 'gemini-2.5-flash', 'gpt-4o-mini'],
      label: 'Signal'
    }
  },
  BALANCE_CACHE_TTL: 5 * 60 * 1000,
  WALLET_ENCRYPTION_SECRET: process.env.WALLET_ENCRYPTION_SECRET || 'dev-encryption-secret-change-me',
  PAY_SH_GATEWAY_SECRET: cleanEnv(process.env.PAY_SH_GATEWAY_SECRET),
  WHITELISTED_WALLETS: new Set(
    (process.env.WHITELISTED_WALLETS || '')
      .split(',')
      .map(w => w.trim())
      .filter(Boolean)
  ),
};

const TRIAL_CONFIG = {
  dailyLimit: parseInt(process.env.TRIAL_DAILY_LIMIT || '3'),
  models: ['gpt-4o-mini'],
  label: 'Trial',
  maxTokens: 2048,
};

const TRADING_TIERS = ['operator', 'architect', 'alpha'];
const ALPHA_TIERS = ['alpha'];
const TOKEN_GATING_ENABLED = !!CONFIG.TOKEN_MINT;

// Time-limited free access window — set FREE_ACCESS_UNTIL env var to an ISO date
// e.g. FREE_ACCESS_UNTIL=2026-02-27T00:00:00Z gives 24h of free signal-tier access
const FREE_ACCESS_UNTIL = process.env.FREE_ACCESS_UNTIL
  ? new Date(process.env.FREE_ACCESS_UNTIL).getTime()
  : 0;
const FREE_ACCESS_TIER = process.env.FREE_ACCESS_TIER || 'signal';

function isFreeAccessActive() {
  return FREE_ACCESS_UNTIL > 0 && Date.now() < FREE_ACCESS_UNTIL;
}

function getFreeAccessEndsAt() {
  return FREE_ACCESS_UNTIL > 0 ? new Date(FREE_ACCESS_UNTIL).toISOString() : null;
}

const PROVIDER_AVAILABLE = {
  claude: !!CONFIG.ANTHROPIC_API_KEY,
  gemini: !!CONFIG.GOOGLE_API_KEY,
  openai: !!CONFIG.OPENAI_API_KEY,
};
const VIDEO_ALLOWED_TIERS = ['operator', 'architect', 'alpha'];
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

const solanaConnection = new Connection(CONFIG.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com');

// Validate secrets — reject dev defaults in production
const DEV_DEFAULTS = ['dev-secret-change-me', 'dev-encryption-secret-change-me', 'dev-admin-key'];
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  // Reject dev-default secrets
  const insecure = [];
  if (DEV_DEFAULTS.includes(CONFIG.API_KEY_SECRET)) insecure.push('API_KEY_SECRET');
  if (DEV_DEFAULTS.includes(CONFIG.WALLET_ENCRYPTION_SECRET)) insecure.push('WALLET_ENCRYPTION_SECRET');
  if (DEV_DEFAULTS.includes(process.env.ADMIN_KEY || 'dev-admin-key')) insecure.push('ADMIN_KEY');

  if (insecure.length > 0) {
    console.error(`[FATAL] Insecure secrets detected in production: ${insecure.join(', ')}`);
    console.error('Set unique values for these env vars before deploying.');
    process.exit(1);
  }

  // Require critical env vars
  const missing = [];
  if (!CONFIG.HELIUS_API_KEY) missing.push('HELIUS_API_KEY');
  if (!CONFIG.HELIUS_RPC_URL) missing.push('HELIUS_RPC_URL');
  if (!CONFIG.ANTHROPIC_API_KEY && !CONFIG.GOOGLE_API_KEY && !CONFIG.OPENAI_API_KEY) {
    missing.push('ANTHROPIC_API_KEY or GOOGLE_API_KEY or OPENAI_API_KEY (at least one)');
  }
  if (!process.env.REDIS_URL && !process.env.UPSTASH_REDIS_REST_URL) {
    missing.push('REDIS_URL');
  }

  if (missing.length > 0) {
    console.error(`[FATAL] Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
} else if (DEV_DEFAULTS.includes(CONFIG.API_KEY_SECRET) || DEV_DEFAULTS.includes(CONFIG.WALLET_ENCRYPTION_SECRET)) {
  console.warn('[WARN] Using dev-default secrets. Set API_KEY_SECRET and WALLET_ENCRYPTION_SECRET before production.');
}

export {
  CONFIG,
  TRIAL_CONFIG,
  TRADING_TIERS,
  ALPHA_TIERS,
  TOKEN_GATING_ENABLED,
  FREE_ACCESS_TIER,
  isFreeAccessActive,
  getFreeAccessEndsAt,
  PROVIDER_AVAILABLE,
  VIDEO_ALLOWED_TIERS,
  VIDEO_CALL_COST,
  TRADING_SYSTEM_PROMPT,
  solanaConnection,
};
