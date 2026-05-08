// Persistent usage tracking using Redis
import { getRedis } from './redis.js';
import { logger } from './logger.js';

const USAGE_PREFIX = 'meterflow:usage:';
const IS_PROD = process.env.NODE_ENV === 'production';

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

const TRIAL_PREFIX = 'meterflow:trial:';

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

const GLOBAL_DAILY_KEY = 'meterflow:stats:daily:';
const GLOBAL_ALLTIME_KEY = 'meterflow:stats:alltime';

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
 * Get top users by usage for today
 * @param {number} limit - max results to return
 * @returns {Promise<Array<{ apiKey: string, count: number, tokens: number }>>}
 */
export async function getTopUsersToday(limit = 10) {
  const today = getTodayKey();
  const r = getRedis();

  if (!r) {
    const entries = [];
    for (const [key, usage] of fallbackUsage.entries()) {
      if (key.startsWith('trial:') || usage.date !== today) continue;
      entries.push({ apiKey: key, count: usage.count, tokens: usage.tokens });
    }
    return entries.sort((a, b) => b.count - a.count).slice(0, limit);
  }

  try {
    const pattern = `${USAGE_PREFIX}*:${today}`;
    const keys = [];
    let cursor = '0';
    do {
      const [next, batch] = await r.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');

    if (keys.length === 0) return [];

    const pipeline = r.pipeline();
    for (const key of keys) pipeline.hgetall(key);
    const results = await pipeline.exec();

    const entries = keys.map((key, i) => {
      const data = results[i]?.[1] || {};
      const apiKey = key.replace(USAGE_PREFIX, '').replace(`:${today}`, '');
      return {
        apiKey,
        count: parseInt(data.count, 10) || 0,
        tokens: parseInt(data.tokens, 10) || 0,
      };
    });

    return entries.sort((a, b) => b.count - a.count).slice(0, limit);
  } catch (e) {
    logger.error('KV-Usage failed to get top users', { err: e.message });
    return [];
  }
}

// ═══════════ MODEL ANALYTICS ═══════════

const MODEL_PREFIX = 'meterflow:model:';

/**
 * Track per-model stats: calls, tokens, errors, latency
 * @param {string} model - model ID (e.g. 'gemini-2.5-flash')
 * @param {number} tokens - total tokens used
 * @param {number} latencyMs - response time in ms
 * @param {boolean} isError - whether this request failed
 */
export async function incrementModelStats(model, tokens = 0, latencyMs = 0, isError = false) {
  const today = getTodayKey();
  const r = getRedis();

  if (!r) {
    // In-memory fallback for dev
    const key = `model:${model}:${today}`;
    let stats = fallbackUsage.get(key);
    if (!stats || stats.date !== today) stats = { date: today, calls: 0, tokens: 0, errors: 0, totalMs: 0 };
    stats.calls += 1;
    stats.tokens += tokens;
    if (isError) stats.errors += 1;
    stats.totalMs += latencyMs;
    fallbackUsage.set(key, stats);
    return;
  }

  try {
    const key = `${MODEL_PREFIX}${model}:${today}`;
    const pipeline = r.pipeline();
    pipeline.hincrby(key, 'calls', 1);
    pipeline.hincrby(key, 'tokens', tokens);
    if (isError) pipeline.hincrby(key, 'errors', 1);
    pipeline.hincrby(key, 'totalMs', Math.round(latencyMs));
    pipeline.expire(key, 48 * 60 * 60);
    await pipeline.exec();
  } catch (e) {
    logger.error('KV-Usage failed to increment model stats', { err: e.message, model });
  }
}

/**
 * Get analytics for all models today
 * @returns {Promise<Array<{ model: string, calls: number, tokens: number, errors: number, avgMs: number }>>}
 */
export async function getModelAnalytics() {
  const today = getTodayKey();
  const r = getRedis();

  if (!r) {
    const results = [];
    for (const [key, stats] of fallbackUsage.entries()) {
      if (!key.startsWith('model:') || stats.date !== today) continue;
      const model = key.replace('model:', '').replace(`:${today}`, '');
      results.push({
        model,
        calls: stats.calls,
        tokens: stats.tokens,
        errors: stats.errors,
        avgMs: stats.calls > 0 ? Math.round(stats.totalMs / stats.calls) : 0,
      });
    }
    return results.sort((a, b) => b.calls - a.calls);
  }

  try {
    const pattern = `${MODEL_PREFIX}*:${today}`;
    const keys = [];
    let cursor = '0';
    do {
      const [next, batch] = await r.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');

    if (keys.length === 0) return [];

    const pipeline = r.pipeline();
    for (const key of keys) pipeline.hgetall(key);
    const results = await pipeline.exec();

    return keys.map((key, i) => {
      const data = results[i]?.[1] || {};
      const model = key.replace(MODEL_PREFIX, '').replace(`:${today}`, '');
      const calls = parseInt(data.calls, 10) || 0;
      return {
        model,
        calls,
        tokens: parseInt(data.tokens, 10) || 0,
        errors: parseInt(data.errors, 10) || 0,
        avgMs: calls > 0 ? Math.round((parseInt(data.totalMs, 10) || 0) / calls) : 0,
      };
    }).sort((a, b) => b.calls - a.calls);
  } catch (e) {
    logger.error('KV-Usage failed to get model analytics', { err: e.message });
    return [];
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
