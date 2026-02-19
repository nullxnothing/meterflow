// Persistent API key storage using Redis
import Redis from 'ioredis';

const KEY_PREFIX = 'infinite:apikey:';
const WALLET_PREFIX = 'infinite:wallet:';

let redis = null;

function getRedis() {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
    if (!redisUrl) return null;
    try {
      redis = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
      redis.on('error', (err) => console.error('[KV-Keys] Redis error:', err.message));
    } catch (e) {
      console.error('[KV-Keys] Redis connection failed:', e.message);
      return null;
    }
  }
  return redis;
}

// In-memory fallback
const fallbackApiKeys = new Map();
const fallbackWalletKeys = new Map();

/** Get key data by API key */
export async function getKeyData(apiKey) {
  const r = getRedis();
  if (!r) return fallbackApiKeys.get(apiKey) || null;

  try {
    const data = await r.get(`${KEY_PREFIX}${apiKey}`);
    if (data) return JSON.parse(data);
    // Check memory fallback (key may have been set before Redis connected)
    return fallbackApiKeys.get(apiKey) || null;
  } catch (e) {
    console.error('[KV-Keys] Failed to get key:', e.message);
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
    console.error('[KV-Keys] Failed to set key:', e.message);
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
    console.error('[KV-Keys] Failed to get wallet key:', e.message);
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
    console.error('[KV-Keys] Failed to set wallet key:', e.message);
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
    console.error('[KV-Keys] Failed to delete key:', e.message);
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
