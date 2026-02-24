// Persistent usage tracking using Redis
import Redis from 'ioredis';
import { logger } from './logger.js';

const USAGE_PREFIX = 'infinite:usage:';
const IS_PROD = process.env.NODE_ENV === 'production';

let redis = null;

function getRedis() {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
    if (!redisUrl) {
      if (IS_PROD) {
        logger.error('REDIS_URL is required in production for usage tracking');
        process.exit(1);
      }
      return null;
    }
    try {
      redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
      redis.on('error', (err) => logger.error('KV-Usage Redis error', { err: err.message }));
    } catch (e) {
      logger.error('KV-Usage Redis connection failed', { err: e.message });
      if (IS_PROD) process.exit(1);
      return null;
    }
  }
  return redis;
}

// In-memory fallback (dev only)
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
    logger.error('KV-Usage failed to get usage', { err: e.message });
    if (IS_PROD) throw new Error('Usage store unavailable');
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
    logger.error('KV-Usage failed to increment usage', { err: e.message });
    if (IS_PROD) throw new Error('Usage store unavailable');
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

// ═══════════ TRIAL USAGE (IP-BASED) ═══════════

const TRIAL_PREFIX = 'infinite:trial:';

export async function getTrialUsage(ip) {
  const today = getTodayKey();
  const r = getRedis();

  if (!r) {
    const usage = fallbackUsage.get(`trial:${ip}`);
    if (!usage || usage.date !== today) return { date: today, count: 0 };
    return usage;
  }

  try {
    const key = `${TRIAL_PREFIX}${ip}:${today}`;
    const count = await r.get(key);
    return { date: today, count: parseInt(count, 10) || 0 };
  } catch (e) {
    logger.error('KV-Usage failed to get trial usage', { err: e.message });
    const usage = fallbackUsage.get(`trial:${ip}`);
    if (!usage || usage.date !== today) return { date: today, count: 0 };
    return usage;
  }
}

export async function incrementTrialUsage(ip) {
  const today = getTodayKey();
  const r = getRedis();

  if (!r) {
    let usage = fallbackUsage.get(`trial:${ip}`);
    if (!usage || usage.date !== today) usage = { date: today, count: 0 };
    usage.count += 1;
    fallbackUsage.set(`trial:${ip}`, usage);
    return usage;
  }

  try {
    const key = `${TRIAL_PREFIX}${ip}:${today}`;
    const count = await r.incr(key);
    if (count === 1) await r.expire(key, 48 * 60 * 60);
    return { date: today, count };
  } catch (e) {
    logger.error('KV-Usage failed to increment trial usage', { err: e.message });
    let usage = fallbackUsage.get(`trial:${ip}`);
    if (!usage || usage.date !== today) usage = { date: today, count: 0 };
    usage.count += 1;
    fallbackUsage.set(`trial:${ip}`, usage);
    return usage;
  }
}

// ═══════════ GLOBAL STATS ═══════════

const GLOBAL_DAILY_KEY = 'infinite:stats:daily:';
const GLOBAL_ALLTIME_KEY = 'infinite:stats:alltime';

// In-memory fallback for global stats
const fallbackGlobal = { calls: 0, tokens: 0, allTimeCalls: 0, allTimeTokens: 0 };

/**
 * Increment global counters (called alongside per-key usage)
 */
export async function incrementGlobalStats(tokens = 0) {
  const today = getTodayKey();
  const r = getRedis();

  if (!r) {
    fallbackGlobal.calls += 1;
    fallbackGlobal.tokens += tokens;
    fallbackGlobal.allTimeCalls += 1;
    fallbackGlobal.allTimeTokens += tokens;
    return;
  }

  try {
    const dailyKey = `${GLOBAL_DAILY_KEY}${today}`;
    const pipeline = r.pipeline();
    pipeline.hincrby(dailyKey, 'calls', 1);
    pipeline.hincrby(dailyKey, 'tokens', tokens);
    pipeline.expire(dailyKey, 48 * 60 * 60);
    pipeline.hincrby(GLOBAL_ALLTIME_KEY, 'calls', 1);
    pipeline.hincrby(GLOBAL_ALLTIME_KEY, 'tokens', tokens);
    await pipeline.exec();
  } catch (e) {
    logger.error('KV-Usage failed to increment global stats', { err: e.message });
    fallbackGlobal.calls += 1;
    fallbackGlobal.tokens += tokens;
    fallbackGlobal.allTimeCalls += 1;
    fallbackGlobal.allTimeTokens += tokens;
  }
}

/**
 * Get global stats for the public /stats endpoint
 * @returns {Promise<{ todayCalls: number, todayTokens: number, allTimeCalls: number, allTimeTokens: number }>}
 */
export async function getGlobalStats() {
  const today = getTodayKey();
  const r = getRedis();

  if (!r) {
    return {
      todayCalls: fallbackGlobal.calls,
      todayTokens: fallbackGlobal.tokens,
      allTimeCalls: fallbackGlobal.allTimeCalls,
      allTimeTokens: fallbackGlobal.allTimeTokens,
    };
  }

  try {
    const dailyKey = `${GLOBAL_DAILY_KEY}${today}`;
    const [daily, allTime] = await Promise.all([
      r.hgetall(dailyKey),
      r.hgetall(GLOBAL_ALLTIME_KEY),
    ]);
    return {
      todayCalls: parseInt(daily?.calls, 10) || 0,
      todayTokens: parseInt(daily?.tokens, 10) || 0,
      allTimeCalls: parseInt(allTime?.calls, 10) || 0,
      allTimeTokens: parseInt(allTime?.tokens, 10) || 0,
    };
  } catch (e) {
    logger.error('KV-Usage failed to get global stats', { err: e.message });
    return {
      todayCalls: fallbackGlobal.calls,
      todayTokens: fallbackGlobal.tokens,
      allTimeCalls: fallbackGlobal.allTimeCalls,
      allTimeTokens: fallbackGlobal.allTimeTokens,
    };
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
      logger.error('KV-Usage failed to reset usage', { err: e.message });
    }
  }
}
