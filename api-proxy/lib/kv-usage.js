// Persistent usage tracking using Redis (Railway or Upstash)
import Redis from 'ioredis';

const USAGE_PREFIX = 'infinite:usage:';

// Initialize Redis client
let redis = null;

function getRedis() {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
    if (!redisUrl) {
      return null;
    }
    try {
      redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
      redis.on('error', (err) => console.error('[KV-Usage] Redis error:', err.message));
    } catch (e) {
      console.error('[KV-Usage] Redis connection failed:', e.message);
      return null;
    }
  }
  return redis;
}

// In-memory fallback
const fallbackUsage = new Map();

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get usage for an API key
 * @param {string} apiKey
 * @returns {Promise<{ date: string, count: number, tokens: number }>}
 */
export async function getUsage(apiKey) {
  const today = getTodayKey();
  const r = getRedis();
  
  if (!r) {
    const usage = fallbackUsage.get(apiKey);
    if (!usage || usage.date !== today) {
      return { date: today, count: 0, tokens: 0 };
    }
    return usage;
  }

  try {
    const key = `${USAGE_PREFIX}${apiKey}:${today}`;
    const data = await r.hgetall(key);
    if (!data || Object.keys(data).length === 0) {
      return { date: today, count: 0, tokens: 0 };
    }
    return {
      date: today,
      count: parseInt(data.count, 10) || 0,
      tokens: parseInt(data.tokens, 10) || 0,
    };
  } catch (e) {
    console.error('[KV-Usage] Failed to get usage:', e);
    const usage = fallbackUsage.get(apiKey);
    if (!usage || usage.date !== today) {
      return { date: today, count: 0, tokens: 0 };
    }
    return usage;
  }
}

/**
 * Increment usage for an API key
 * @param {string} apiKey
 * @param {number} tokens - tokens to add
 * @returns {Promise<{ date: string, count: number, tokens: number }>}
 */
export async function incrementUsage(apiKey, tokens = 0) {
  const today = getTodayKey();
  const r = getRedis();

  if (!r) {
    let usage = fallbackUsage.get(apiKey);
    if (!usage || usage.date !== today) {
      usage = { date: today, count: 0, tokens: 0 };
    }
    usage.count += 1;
    usage.tokens += tokens;
    fallbackUsage.set(apiKey, usage);
    return usage;
  }

  try {
    const key = `${USAGE_PREFIX}${apiKey}:${today}`;
    const [countResult, tokensResult] = await Promise.all([
      r.hincrby(key, 'count', 1),
      r.hincrby(key, 'tokens', tokens),
    ]);
    // Set expiry to 48 hours so old usage data auto-cleans
    await r.expire(key, 48 * 60 * 60);
    return {
      date: today,
      count: countResult,
      tokens: tokensResult,
    };
  } catch (e) {
    console.error('[KV-Usage] Failed to increment usage:', e);
    // Fallback to memory
    let usage = fallbackUsage.get(apiKey);
    if (!usage || usage.date !== today) {
      usage = { date: today, count: 0, tokens: 0 };
    }
    usage.count += 1;
    usage.tokens += tokens;
    fallbackUsage.set(apiKey, usage);
    return usage;
  }
}

/**
 * Reset usage for an API key (used when reconnecting wallet, etc)
 * @param {string} apiKey
 */
export async function resetUsage(apiKey) {
  fallbackUsage.delete(apiKey);
  const r = getRedis();
  if (r) {
    try {
      const today = getTodayKey();
      await r.del(`${USAGE_PREFIX}${apiKey}:${today}`);
    } catch (e) {
      console.error('[KV-Usage] Failed to reset usage:', e);
    }
  }
}
