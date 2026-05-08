import Redis from 'ioredis';
import { CFG } from '../config.js';

const PREFIX = 'meterflow:twitter:';
const REPLIED_KEY = `${PREFIX}replied`;
const DAILY_PROACTIVE_KEY = `${PREFIX}daily_proactive`;
const USER_COOLDOWN_PREFIX = `${PREFIX}cooldown:`;

let redis = null;

let redisWarned = false;

function getRedis() {
  if (redis) return redis;
  if (!CFG.REDIS_URL) {
    if (!redisWarned) {
      console.warn('[STATE] No REDIS_URL — using in-memory fallback');
      redisWarned = true;
    }
    return null;
  }
  try {
    redis = new Redis(CFG.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true });
    redis.on('error', (err) => console.error('[STATE] Redis error:', err.message));
    redis.on('ready', () => console.log('[STATE] Redis connected'));
    return redis;
  } catch (err) {
    console.error('[STATE] Redis init failed:', err.message);
    return null;
  }
}

const mem = {
  replied: new Set(),
  dailyProactive: 0,
  cooldowns: new Map(),
  lastReset: Date.now(),
};

function resetDailyIfNeeded() {
  const now = Date.now();
  if (now - mem.lastReset > 24 * 60 * 60 * 1000) {
    mem.dailyProactive = 0;
    mem.lastReset = now;
  }
}

async function hasReplied(tweetId) {
  const r = getRedis();
  if (!r) return mem.replied.has(tweetId);
  return (await r.sismember(REPLIED_KEY, tweetId)) === 1;
}

async function markReplied(tweetId) {
  const r = getRedis();
  if (!r) { mem.replied.add(tweetId); return; }
  await r.sadd(REPLIED_KEY, tweetId);
}

async function incrementDaily() {
  const r = getRedis();
  if (!r) {
    resetDailyIfNeeded();
    mem.dailyProactive++;
    return;
  }
  const count = await r.incr(DAILY_PROACTIVE_KEY);
  if (count === 1) await r.expire(DAILY_PROACTIVE_KEY, 86400);
}

async function getDailyCount() {
  const r = getRedis();
  if (!r) {
    resetDailyIfNeeded();
    return mem.dailyProactive;
  }
  const val = await r.get(DAILY_PROACTIVE_KEY);
  return parseInt(val || '0', 10);
}

async function isUserOnCooldown(userId) {
  const r = getRedis();
  if (!r) {
    const expires = mem.cooldowns.get(userId);
    return expires ? Date.now() < expires : false;
  }
  return (await r.exists(`${USER_COOLDOWN_PREFIX}${userId}`)) === 1;
}

async function setUserCooldown(userId, ms) {
  const r = getRedis();
  if (!r) { mem.cooldowns.set(userId, Date.now() + ms); return; }
  await r.set(`${USER_COOLDOWN_PREFIX}${userId}`, '1', 'PX', ms);
}

async function getStats() {
  return {
    proactiveReplies: await getDailyCount(),
  };
}

export {
  hasReplied, markReplied,
  incrementDaily, getDailyCount,
  isUserOnCooldown, setUserCooldown,
  getStats,
};
