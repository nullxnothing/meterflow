
// Persistent video operation storage using Redis
import { getRedis } from './redis.js';
import { logger } from './logger.js';

const VIDEO_PREFIX = 'meterflow:video:';
const VIDEO_TTL = 7 * 24 * 60 * 60; // 7 days

// In-memory fallback
const fallback = new Map();

export async function getVideoOp(operationName) {
  const r = getRedis();
  if (!r) return fallback.get(operationName) || null;

  try {
    const data = await r.get(`${VIDEO_PREFIX}${operationName}`);
    if (data) return JSON.parse(data);
    return fallback.get(operationName) || null;
  } catch (e) {
    logger.error('KV-Videos get failed', { err: e.message });
    return fallback.get(operationName) || null;
  }
}

export async function setVideoOp(operationName, data) {
  fallback.set(operationName, data);
  const r = getRedis();
  if (!r) return;

  try {
    await r.set(`${VIDEO_PREFIX}${operationName}`, JSON.stringify(data), 'EX', VIDEO_TTL);
  } catch (e) {
    logger.error('KV-Videos set failed', { err: e.message });
  }
}

export async function listVideoOps(apiKey) {
  const r = getRedis();
  if (!r) {
    return [...fallback.values()].filter(v => v.apiKey === apiKey);
  }

  try {
    let cursor = '0';
    const results = [];
    do {
      const [next, keys] = await r.scan(cursor, 'MATCH', `${VIDEO_PREFIX}*`, 'COUNT', 100);
      cursor = next;
      if (keys.length) {
        const values = await r.mget(keys);
        for (const val of values) {
          if (!val) continue;
          const parsed = JSON.parse(val);
          if (parsed.apiKey === apiKey) results.push(parsed);
        }
      }
    } while (cursor !== '0');
    return results;
  } catch (e) {
    logger.error('KV-Videos list failed', { err: e.message });
    return [...fallback.values()].filter(v => v.apiKey === apiKey);
  }
}
