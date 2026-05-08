// Persistent API key storage using Redis
import { getRedis } from './redis.js';
import { logger } from './logger.js';

const KEY_PREFIX = 'meterflow:apikey:';
const WALLET_PREFIX = 'meterflow:wallet:';
const IS_PROD = process.env.NODE_ENV === 'production';

// In-memory fallback (dev only — production requires Redis)
const fallbackApiKeys = new Map();
const fallbackWalletKeys = new Map();

/** Get key data by API key */
export async function getKeyData(apiKey) {
  const r = getRedis();
  if (!r) return fallbackApiKeys.get(apiKey) || null;

  try {
    const data = await r.get(`${KEY_PREFIX}${apiKey}`);
    if (data) return JSON.parse(data);
    return fallbackApiKeys.get(apiKey) || null;
  } catch (e) {
    logger.error('KV-Keys failed to get key', { err: e.message });
    if (IS_PROD) throw new Error('Key store unavailable');
    return fallbackApiKeys.get(apiKey) || null;
  }
}

/** Store an API key */
export async function setKeyData(apiKey, data) {
  fallbackApiKeys.set(apiKey, data);
  const r = getRedis();
  if (!r) return;

  try {
    await r.set(`${KEY_PREFIX}${apiKey}`, JSON.stringify(data));
  } catch (e) {
    logger.error('KV-Keys failed to set key', { err: e.message });
    if (IS_PROD) throw new Error('Key store unavailable');
  }
}

/** Get API key for a wallet address */
export async function getKeyForWallet(wallet) {
  const r = getRedis();
  if (!r) return fallbackWalletKeys.get(wallet) || null;

  try {
    const apiKey = await r.get(`${WALLET_PREFIX}${wallet}`);
    if (apiKey) return apiKey;
    return fallbackWalletKeys.get(wallet) || null;
  } catch (e) {
    logger.error('KV-Keys failed to get wallet key', { err: e.message });
    if (IS_PROD) throw new Error('Key store unavailable');
    return fallbackWalletKeys.get(wallet) || null;
  }
}

/** Map wallet -> API key */
export async function setKeyForWallet(wallet, apiKey) {
  fallbackWalletKeys.set(wallet, apiKey);
  const r = getRedis();
  if (!r) return;

  try {
    await r.set(`${WALLET_PREFIX}${wallet}`, apiKey);
  } catch (e) {
    logger.error('KV-Keys failed to set wallet key', { err: e.message });
  }
}

/** Delete an API key and its wallet mapping */
export async function deleteKey(apiKey, wallet) {
  fallbackApiKeys.delete(apiKey);
  if (wallet) fallbackWalletKeys.delete(wallet);
  const r = getRedis();
  if (!r) return;

  try {
    await r.del(`${KEY_PREFIX}${apiKey}`);
    if (wallet) await r.del(`${WALLET_PREFIX}${wallet}`);
  } catch (e) {
    logger.error('KV-Keys failed to delete key', { err: e.message });
  }
}

/** Check if an API key exists */
export async function hasKey(apiKey) {
  const r = getRedis();
  if (!r) return fallbackApiKeys.has(apiKey);

  try {
    const exists = await r.exists(`${KEY_PREFIX}${apiKey}`);
    return exists === 1 || fallbackApiKeys.has(apiKey);
  } catch (e) {
    return fallbackApiKeys.has(apiKey);
  }
}

/** Count total issued keys (approximate — scans Redis) */
export async function countKeys() {
  const r = getRedis();
  if (!r) return fallbackApiKeys.size;

  try {
    let count = 0;
    let cursor = '0';
    do {
      const [next, keys] = await r.scan(cursor, 'MATCH', `${KEY_PREFIX}*`, 'COUNT', 200);
      cursor = next;
      count += keys.length;
    } while (cursor !== '0');
    return Math.max(count, fallbackApiKeys.size);
  } catch (e) {
    return fallbackApiKeys.size;
  }
}
