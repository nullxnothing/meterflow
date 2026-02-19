import { config } from 'dotenv';
import { Connection } from '@solana/web3.js';
config();

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
  BALANCE_CACHE_TTL: 5 * 60 * 1000,
  WALLET_ENCRYPTION_SECRET: process.env.WALLET_ENCRYPTION_SECRET || 'dev-encryption-secret-change-me',
  WHITELISTED_WALLETS: new Set(
    (process.env.WHITELISTED_WALLETS || '5bmb4PnoTiHd4Qm1kphqmFiKDgQCZThuPTG5vm1MsNZ4')
      .split(',')
      .map(w => w.trim())
      .filter(Boolean)
  ),
};

const TRADING_TIERS = ['operator', 'architect'];
const TOKEN_GATING_ENABLED = CONFIG.TOKEN_MINT && CONFIG.TOKEN_MINT !== 'PASTE_YOUR_TOKEN_MINT_HERE';
const PROVIDER_AVAILABLE = {
  claude: !!CONFIG.ANTHROPIC_API_KEY,
  gemini: !!CONFIG.GOOGLE_API_KEY,
  openai: !!CONFIG.OPENAI_API_KEY,
};
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

const solanaConnection = new Connection(CONFIG.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com');

// Validate secrets — reject dev defaults in production
const DEV_DEFAULTS = ['dev-secret-change-me', 'dev-encryption-secret-change-me', 'dev-admin-key'];
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  const insecure = [];
  if (DEV_DEFAULTS.includes(CONFIG.API_KEY_SECRET)) insecure.push('API_KEY_SECRET');
  if (DEV_DEFAULTS.includes(CONFIG.WALLET_ENCRYPTION_SECRET)) insecure.push('WALLET_ENCRYPTION_SECRET');
  if (DEV_DEFAULTS.includes(process.env.ADMIN_KEY || 'dev-admin-key')) insecure.push('ADMIN_KEY');

  if (insecure.length > 0) {
    console.error(`[FATAL] Insecure secrets detected in production: ${insecure.join(', ')}`);
    console.error('Set unique values for these env vars before deploying.');
    process.exit(1);
  }
} else if (DEV_DEFAULTS.includes(CONFIG.API_KEY_SECRET) || DEV_DEFAULTS.includes(CONFIG.WALLET_ENCRYPTION_SECRET)) {
  console.warn('[WARN] Using dev-default secrets. Set API_KEY_SECRET and WALLET_ENCRYPTION_SECRET before production.');
}

export {
  CONFIG,
  TRADING_TIERS,
  TOKEN_GATING_ENABLED,
  PROVIDER_AVAILABLE,
  VIDEO_ALLOWED_TIERS,
  VIDEO_CALL_COST,
  TRADING_SYSTEM_PROMPT,
  solanaConnection,
};
