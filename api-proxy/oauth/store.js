import crypto from 'crypto';
import Redis from 'ioredis';

// Redis key prefix for OAuth tokens
const OAUTH_TOKEN_PREFIX = 'infinite:oauth:';

// Initialize Redis client
let redis = null;

function getRedis() {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
    if (!redisUrl) {
      console.warn('[OAuth] Redis not configured — tokens will use in-memory fallback');
      return null;
    }
    try {
      redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
      redis.on('error', (err) => console.error('[OAuth] Redis error:', err.message));
    } catch (e) {
      console.error('[OAuth] Redis connection failed:', e.message);
      return null;
    }
  }
  return redis;
}

// In-memory fallback
const oauthTokens = new Map();

// state → { apiKey, provider, expiresAt }
const pendingStates = new Map();

const STATE_TTL = 10 * 60 * 1000; // 10 minutes

export async function setToken(apiKey, provider, tokenData) {
  const r = getRedis();
  if (!r) {
    const existing = oauthTokens.get(apiKey) || {};
    existing[provider] = tokenData;
    oauthTokens.set(apiKey, existing);
    return;
  }

  try {
    const key = `${OAUTH_TOKEN_PREFIX}${apiKey}`;
    const raw = await r.get(key);
    const existing = raw ? JSON.parse(raw) : {};
    existing[provider] = tokenData;
    await r.set(key, JSON.stringify(existing));
  } catch (e) {
    console.error('[OAuth] Failed to save token to Redis:', e);
    // Fallback to memory
    const existing = oauthTokens.get(apiKey) || {};
    existing[provider] = tokenData;
    oauthTokens.set(apiKey, existing);
  }
}

export async function getToken(apiKey, provider) {
  const r = getRedis();
  if (!r) {
    const tokens = oauthTokens.get(apiKey);
    return tokens?.[provider] || null;
  }

  try {
    const key = `${OAUTH_TOKEN_PREFIX}${apiKey}`;
    const raw = await r.get(key);
    const tokens = raw ? JSON.parse(raw) : null;
    return tokens?.[provider] || null;
  } catch (e) {
    console.error('[OAuth] Failed to get token from Redis:', e);
    const tokens = oauthTokens.get(apiKey);
    return tokens?.[provider] || null;
  }
}

export async function removeToken(apiKey, provider) {
  const r = getRedis();
  if (!r) {
    const tokens = oauthTokens.get(apiKey);
    if (!tokens) return;
    delete tokens[provider];
    oauthTokens.set(apiKey, tokens);
    return;
  }

  try {
    const key = `${OAUTH_TOKEN_PREFIX}${apiKey}`;
    const raw = await r.get(key);
    if (!raw) return;
    const tokens = JSON.parse(raw);
    delete tokens[provider];
    await r.set(key, JSON.stringify(tokens));
  } catch (e) {
    console.error('[OAuth] Failed to remove token from Redis:', e);
  }
}

export async function getConnectedProviders(apiKey) {
  const r = getRedis();
  let tokens;

  if (!r) {
    tokens = oauthTokens.get(apiKey) || {};
  } else {
    try {
      const key = `${OAUTH_TOKEN_PREFIX}${apiKey}`;
      const raw = await r.get(key);
      tokens = raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error('[OAuth] Failed to get providers from Redis:', e);
      tokens = oauthTokens.get(apiKey) || {};
    }
  }

  return {
    github: !!tokens.github,
    google: !!tokens.google,
    notion: !!tokens.notion,
  };
}

export function createState(apiKey, provider) {
  const state = crypto.randomBytes(32).toString('hex');
  pendingStates.set(state, { apiKey, provider, expiresAt: Date.now() + STATE_TTL });
  return state;
}

export function consumeState(state) {
  const data = pendingStates.get(state);
  if (!data) return null;
  pendingStates.delete(state);
  if (Date.now() > data.expiresAt) return null;
  return data;
}

// Cleanup expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pendingStates) {
    if (now > val.expiresAt) pendingStates.delete(key);
  }
}, 5 * 60 * 1000);

