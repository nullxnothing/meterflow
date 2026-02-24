// Redis data layer for Infinite Alpha — CT intelligence scanner
import Redis from 'ioredis';
import { logger } from './logger.js';

const P = 'infinite:alpha:';
const IS_PROD = process.env.NODE_ENV === 'production';

let redis = null;

function getRedis() {
  if (!redis) {
    const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
    if (!url) return null;
    try {
      redis = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
      redis.on('error', (err) => logger.error('KV-Alpha Redis error', { err: err.message }));
    } catch (e) {
      logger.error('KV-Alpha Redis connect failed', { err: e.message });
      return null;
    }
  }
  return redis;
}

// In-memory fallback (dev only)
const mem = {
  profiles: new Map(),
  history: new Map(),
  keyProfiles: new Map(),
  follows: new Map(),
  followers: new Map(),
  discover: [],
  trending: new Map(),
  cas: new Map(),
  notes: new Map(),
  alerts: new Map(),
};

// ── Profile CRUD ──

export async function getProfile(twitterId) {
  const r = getRedis();
  if (!r) return mem.profiles.get(twitterId) || null;
  const data = await r.hgetall(`${P}profile:${twitterId}`);
  if (!data || !data.username) return null;
  if (data.previousNames) data.previousNames = JSON.parse(data.previousNames);
  return data;
}

export async function setProfile(twitterId, data) {
  const r = getRedis();
  const stored = { ...data };
  if (stored.previousNames) stored.previousNames = JSON.stringify(stored.previousNames);
  if (!r) { mem.profiles.set(twitterId, data); return; }
  await r.hset(`${P}profile:${twitterId}`, stored);
  await r.expire(`${P}profile:${twitterId}`, 86400 * 7); // 7d TTL
}

// ── Rename History ──

export async function getProfileHistory(twitterId) {
  const r = getRedis();
  if (!r) return mem.history.get(twitterId) || [];
  const raw = await r.lrange(`${P}profile:history:${twitterId}`, 0, 50);
  return raw.map(JSON.parse);
}

export async function appendProfileHistory(twitterId, entry) {
  const r = getRedis();
  const record = { ...entry, timestamp: Date.now() };
  if (!r) {
    const list = mem.history.get(twitterId) || [];
    list.unshift(record);
    mem.history.set(twitterId, list.slice(0, 50));
    return;
  }
  await r.lpush(`${P}profile:history:${twitterId}`, JSON.stringify(record));
  await r.ltrim(`${P}profile:history:${twitterId}`, 0, 49);
}

// ── Key Profiles ──

export async function getKeyProfiles() {
  const r = getRedis();
  if (!r) return [...mem.keyProfiles.values()];
  const keys = await r.keys(`${P}keyprofile:*`);
  if (!keys.length) return [];
  const pipeline = r.pipeline();
  keys.forEach(k => pipeline.hgetall(k));
  const results = await pipeline.exec();
  return results.map(([err, data]) => err ? null : data).filter(Boolean);
}

export async function setKeyProfile(twitterId, data) {
  const r = getRedis();
  if (!r) { mem.keyProfiles.set(twitterId, { twitterId, ...data }); return; }
  await r.hset(`${P}keyprofile:${twitterId}`, { twitterId, ...data });
}

export async function getKeyProfile(twitterId) {
  const r = getRedis();
  if (!r) return mem.keyProfiles.get(twitterId) || null;
  const data = await r.hgetall(`${P}keyprofile:${twitterId}`);
  return data?.twitterId ? data : null;
}

export async function getKeyProfileCount() {
  const r = getRedis();
  if (!r) return mem.keyProfiles.size;
  const keys = await r.keys(`${P}keyprofile:*`);
  return keys.length;
}

// ── Follow Graph ──

export async function addFollow(keyProfileId, childId, timestamp = Date.now()) {
  const r = getRedis();
  if (!r) {
    const fwd = mem.follows.get(keyProfileId) || new Map();
    fwd.set(childId, timestamp);
    mem.follows.set(keyProfileId, fwd);
    const rev = mem.followers.get(childId) || new Map();
    rev.set(keyProfileId, timestamp);
    mem.followers.set(childId, rev);
    return;
  }
  await r.zadd(`${P}follows:${keyProfileId}`, timestamp, childId);
  await r.zadd(`${P}followers:${childId}`, timestamp, keyProfileId);
}

export async function getFollowersOf(childId, limit = 50, offset = 0) {
  const r = getRedis();
  if (!r) {
    const map = mem.followers.get(childId);
    if (!map) return [];
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(offset, offset + limit)
      .map(([id, ts]) => ({ twitterId: id, followedAt: ts }));
  }
  const raw = await r.zrevrange(`${P}followers:${childId}`, offset, offset + limit - 1, 'WITHSCORES');
  const result = [];
  for (let i = 0; i < raw.length; i += 2) {
    result.push({ twitterId: raw[i], followedAt: Number(raw[i + 1]) });
  }
  return result;
}

export async function getFollowerCount(childId) {
  const r = getRedis();
  if (!r) return (mem.followers.get(childId) || new Map()).size;
  return r.zcard(`${P}followers:${childId}`);
}

export async function getFollowsOf(keyProfileId, limit = 50, offset = 0) {
  const r = getRedis();
  if (!r) {
    const map = mem.follows.get(keyProfileId);
    if (!map) return [];
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(offset, offset + limit)
      .map(([id, ts]) => ({ twitterId: id, followedAt: ts }));
  }
  const raw = await r.zrevrange(`${P}follows:${keyProfileId}`, offset, offset + limit - 1, 'WITHSCORES');
  const result = [];
  for (let i = 0; i < raw.length; i += 2) {
    result.push({ twitterId: raw[i], followedAt: Number(raw[i + 1]) });
  }
  return result;
}

// ── Cached following snapshot (for diffing) ──

export async function getCachedFollowingIds(keyProfileId) {
  const r = getRedis();
  if (!r) return mem.follows.get(keyProfileId) ? [...mem.follows.get(keyProfileId).keys()] : [];
  return r.smembers(`${P}following:snapshot:${keyProfileId}`);
}

export async function setCachedFollowingIds(keyProfileId, ids) {
  const r = getRedis();
  if (!r) return;
  const key = `${P}following:snapshot:${keyProfileId}`;
  await r.del(key);
  if (ids.length) await r.sadd(key, ...ids);
  await r.expire(key, 86400 * 3);
}

// ── Discover Feed ──

export async function addToDiscover(twitterId, data) {
  const r = getRedis();
  const ts = Date.now();
  if (!r) {
    mem.discover.unshift({ twitterId, ...data, detectedAt: ts });
    if (mem.discover.length > 500) mem.discover.length = 500;
    return;
  }
  await r.zadd(`${P}discover`, ts, JSON.stringify({ twitterId, ...data }));
  await r.zremrangebyrank(`${P}discover`, 0, -501); // keep 500 max
}

export async function getDiscoverFeed(limit = 50, offset = 0) {
  const r = getRedis();
  if (!r) return mem.discover.slice(offset, offset + limit);
  const raw = await r.zrevrange(`${P}discover`, offset, offset + limit - 1, 'WITHSCORES');
  const result = [];
  for (let i = 0; i < raw.length; i += 2) {
    try {
      const entry = JSON.parse(raw[i]);
      entry.detectedAt = Number(raw[i + 1]);
      result.push(entry);
    } catch { /* skip corrupt */ }
  }
  return result;
}

// ── Trending ──

export async function updateTrending(twitterId, score, data = {}) {
  const r = getRedis();
  if (!r) { mem.trending.set(twitterId, { score, ...data }); return; }
  await r.zadd(`${P}trending`, score, JSON.stringify({ twitterId, ...data }));
}

export async function getTrendingFeed(limit = 50) {
  const r = getRedis();
  if (!r) {
    return [...mem.trending.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit)
      .map(([id, d]) => ({ twitterId: id, ...d }));
  }
  const raw = await r.zrevrange(`${P}trending`, 0, limit - 1, 'WITHSCORES');
  const result = [];
  for (let i = 0; i < raw.length; i += 2) {
    try {
      const entry = JSON.parse(raw[i]);
      entry.score = Number(raw[i + 1]);
      result.push(entry);
    } catch { /* skip */ }
  }
  return result;
}

// ── Contract Address Detection ──

export async function addCA(twitterId, caData) {
  const r = getRedis();
  const record = { ...caData, detectedAt: Date.now() };
  if (!r) {
    const list = mem.cas.get(twitterId) || [];
    list.unshift(record);
    mem.cas.set(twitterId, list.slice(0, 100));
    return;
  }
  await r.lpush(`${P}ca:${twitterId}`, JSON.stringify(record));
  await r.ltrim(`${P}ca:${twitterId}`, 0, 99);
  await r.expire(`${P}ca:${twitterId}`, 86400 * 30);
}

export async function getCAs(twitterId) {
  const r = getRedis();
  if (!r) return mem.cas.get(twitterId) || [];
  const raw = await r.lrange(`${P}ca:${twitterId}`, 0, 99);
  return raw.map(JSON.parse);
}

// ── Notes ──

export async function setNote(apiKey, twitterId, text) {
  const r = getRedis();
  const key = `${P}notes:${apiKey}:${twitterId}`;
  if (!r) { mem.notes.set(key, { text, updatedAt: Date.now() }); return; }
  await r.set(key, JSON.stringify({ text, updatedAt: Date.now() }));
}

export async function getNote(apiKey, twitterId) {
  const r = getRedis();
  const key = `${P}notes:${apiKey}:${twitterId}`;
  if (!r) return mem.notes.get(key) || null;
  const raw = await r.get(key);
  return raw ? JSON.parse(raw) : null;
}

export async function deleteNote(apiKey, twitterId) {
  const r = getRedis();
  const key = `${P}notes:${apiKey}:${twitterId}`;
  if (!r) { mem.notes.delete(key); return; }
  await r.del(key);
}

// ── User Watchlist ──

export async function addWatchedProfile(apiKey, twitterId, data = {}) {
  const r = getRedis();
  const record = JSON.stringify({ twitterId, ...data, addedAt: Date.now() });
  if (!r) {
    const key = `watchlist:${apiKey}`;
    const list = mem.notes.get(key) || [];
    if (!list.find(e => JSON.parse(e).twitterId === twitterId)) list.push(record);
    mem.notes.set(key, list);
    return;
  }
  await r.hset(`${P}watchlist:${apiKey}`, twitterId, record);
}

export async function getWatchedProfiles(apiKey) {
  const r = getRedis();
  if (!r) {
    const key = `watchlist:${apiKey}`;
    return (mem.notes.get(key) || []).map(JSON.parse);
  }
  const all = await r.hgetall(`${P}watchlist:${apiKey}`);
  if (!all) return [];
  return Object.values(all).map(JSON.parse);
}

export async function removeWatchedProfile(apiKey, twitterId) {
  const r = getRedis();
  if (!r) {
    const key = `watchlist:${apiKey}`;
    const list = (mem.notes.get(key) || []).filter(e => JSON.parse(e).twitterId !== twitterId);
    mem.notes.set(key, list);
    return;
  }
  await r.hdel(`${P}watchlist:${apiKey}`, twitterId);
}

// ── Alerts ──

export async function addAlert(twitterId, alert) {
  const r = getRedis();
  const record = { ...alert, timestamp: Date.now() };
  if (!r) {
    const list = mem.alerts.get(twitterId) || [];
    list.unshift(record);
    mem.alerts.set(twitterId, list.slice(0, 100));
    return;
  }
  await r.lpush(`${P}alerts:${twitterId}`, JSON.stringify(record));
  await r.ltrim(`${P}alerts:${twitterId}`, 0, 99);
  await r.expire(`${P}alerts:${twitterId}`, 86400 * 14);
}

export async function getAlerts(twitterId, limit = 50) {
  const r = getRedis();
  if (!r) return (mem.alerts.get(twitterId) || []).slice(0, limit);
  const raw = await r.lrange(`${P}alerts:${twitterId}`, 0, limit - 1);
  return raw.map(JSON.parse);
}
