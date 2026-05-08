import { config } from 'dotenv';
config();

const CFG = {
  TWITTER_APP_KEY: process.env.TWITTER_APP_KEY || '',
  TWITTER_APP_SECRET: process.env.TWITTER_APP_SECRET || '',
  TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN || '',
  TWITTER_ACCESS_SECRET: process.env.TWITTER_ACCESS_SECRET || '',
  TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || '',
  TWITTER_BOT_USERNAME: process.env.TWITTER_BOT_USERNAME || 'MeterflowBot',

  API_PROXY_URL: process.env.API_PROXY_URL || 'https://meterflow-api.onrender.com',
  BOT_API_KEY: process.env.BOT_API_KEY || '',
  AI_MODEL: process.env.AI_MODEL || 'claude-sonnet-4-6',

  REDIS_URL: process.env.REDIS_URL || '',
  HEALTH_PORT: parseInt(process.env.HEALTH_PORT || '3004', 10),
  DRY_RUN: process.env.DRY_RUN === 'true',
};

const LIMITS = {
  DAILY_CAP: 80,
  PER_USER_COOLDOWN_MS: 2 * 60 * 60 * 1000,

  // Watchlist polling (primary — be early on big accounts)
  WATCHLIST_POLL_CRON: '*/5 * * * *',
  WATCHLIST_MAX_AGE_MS: 15 * 60 * 1000,
  MAX_PER_WATCHLIST_RUN: 3,
  // Always reply — quote tweets from small accounts look spammy
  QUOTE_THRESHOLD: 500_000,

  // Keyword search (secondary — catch trending convos)
  SEARCH_CRON: '*/15 * * * *',
  MAX_PER_SEARCH_RUN: 2,
  SEARCH_MIN_LIKES: 5,
  SEARCH_MAX_AGE_MS: 2 * 60 * 60 * 1000,
};

const AI_CFG = {
  MAX_TOKENS: 280,
  TIMEOUT_MS: 30_000,
};

const required = ['TWITTER_APP_KEY', 'TWITTER_APP_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'];
for (const key of required) {
  if (!CFG[key]) {
    console.error(`[FATAL] Missing ${key}`);
    process.exit(1);
  }
}

if (!CFG.BOT_API_KEY) {
  console.warn('[WARN] BOT_API_KEY not set — AI responses disabled');
}

if (CFG.DRY_RUN) {
  console.log('[MODE] DRY_RUN enabled — no tweets will be posted');
}

export { CFG, LIMITS, AI_CFG };
