import { config } from 'dotenv';
config();

function parseList(val) {
  return (val || '').split(',').map(s => s.trim()).filter(Boolean);
}

const BOT_CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || '',
  CLIENT_ID: process.env.DISCORD_CLIENT_ID || '',
  GUILD_ID: process.env.GUILD_ID || '',

  API_PROXY_URL: process.env.API_PROXY_URL || 'https://infinite-protocol.onrender.com',
  BOT_API_KEY: process.env.BOT_API_KEY || '',
  AI_MODEL: process.env.AI_MODEL || 'gemini-2.5-flash',

  MOD_LOG_CHANNEL: process.env.MOD_LOG_CHANNEL || '',
  WELCOME_CHANNEL: process.env.WELCOME_CHANNEL || '',
  TICKET_CHANNEL: process.env.TICKET_CHANNEL || '',
  DEV_REPORT_CHANNEL: process.env.DEV_REPORT_CHANNEL || '',
  RENDER_API_KEY: process.env.RENDER_API_KEY || '',
  IMMUNE_ROLES: new Set(parseList(process.env.IMMUNE_ROLES)),
  AI_CHANNELS: new Set(parseList(process.env.AI_CHANNELS)),

  HEALTH_PORT: parseInt(process.env.HEALTH_PORT || '3003', 10),
};

const SPAM = {
  PATTERNS: [
    /discord\.gg\/\w+/i,
    /discordapp\.com\/invite/i,
    /free\s+nitro/i,
    /steam\s*community/i,
    /claim\s+your?\s+(free|airdrop|reward)/i,
    /send\s+\d+\s*sol/i,
    /validate\s+your?\s+wallet/i,
    /connect\s+wallet\s+to\s+claim/i,
    /dsc\.gg\//i,
  ],
  ALLOWED_DOMAINS: new Set([
    'infinite.sh',
    'solscan.io',
    'jup.ag',
    'pump.fun',
    'dexscreener.com',
    'github.com',
    'x.com',
    'twitter.com',
    'raydium.io',
    'birdeye.so',
    'docs.solana.com',
    'solana.com',
    'render.com',
    'vercel.app',
  ]),
  MAX_LINKS: 3,
  NEW_ACCOUNT_AGE_MS: 24 * 60 * 60 * 1000,
  DUPLICATE_WINDOW_MS: 60_000,
  DUPLICATE_THRESHOLD: 3,
  RATE_WINDOW_MS: 10_000,
  RATE_THRESHOLD: 5,
};

const AI = {
  MAX_HISTORY: 10,
  MAX_TOKENS: 1024,
  TIMEOUT_MS: 30_000,
  DISCORD_CHAR_LIMIT: 2000,
};

// Validate critical env vars
if (!BOT_CONFIG.DISCORD_TOKEN) {
  console.error('[FATAL] Missing DISCORD_TOKEN');
  process.exit(1);
}
if (!BOT_CONFIG.BOT_API_KEY) {
  console.warn('[WARN] BOT_API_KEY not set — AI responses disabled');
}

export { BOT_CONFIG, SPAM, AI };
