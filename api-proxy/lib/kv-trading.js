// Persistent trading positions and trade history using Redis
import { getRedis } from './redis.js';
import { logger } from './logger.js';

const POSITIONS_PREFIX = 'meterflow:positions:';
const HISTORY_PREFIX = 'meterflow:history:';
const HISTORY_MAX = 1000;
const HISTORY_TTL = 30 * 24 * 3600; // 30 days

/** Persist all positions for an API key */
export async function persistPositions(apiKey, positionsMap) {
  const r = getRedis();
  if (!r) return;
  try {
    const data = Object.fromEntries(positionsMap);
    await r.set(`${POSITIONS_PREFIX}${apiKey}`, JSON.stringify(data));
  } catch (e) {
    logger.error('KV-Trading persist positions failed', { err: e.message });
  }
}

/** Load positions for an API key -> Map<mint, position> */
export async function loadPositions(apiKey) {
  const r = getRedis();
  if (!r) return null;
  try {
    const raw = await r.get(`${POSITIONS_PREFIX}${apiKey}`);
    if (!raw) return null;
    return new Map(Object.entries(JSON.parse(raw)));
  } catch (e) {
    logger.error('KV-Trading load positions failed', { err: e.message });
    return null;
  }
}

/** Append a trade to history and persist */
export async function persistTrade(apiKey, entry) {
  const r = getRedis();
  if (!r) return;
  try {
    await r.lpush(`${HISTORY_PREFIX}${apiKey}`, JSON.stringify(entry));
    await r.ltrim(`${HISTORY_PREFIX}${apiKey}`, 0, HISTORY_MAX - 1);
    await r.expire(`${HISTORY_PREFIX}${apiKey}`, HISTORY_TTL);
  } catch (e) {
    logger.error('KV-Trading persist trade failed', { err: e.message });
  }
}

/** Load trade history for an API key */
export async function loadHistory(apiKey, limit = 100) {
  const r = getRedis();
  if (!r) return null;
  try {
    const raw = await r.lrange(`${HISTORY_PREFIX}${apiKey}`, 0, limit - 1);
    return raw.map(JSON.parse);
  } catch (e) {
    logger.error('KV-Trading load history failed', { err: e.message });
    return null;
  }
}
