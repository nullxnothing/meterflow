// Persistent API key storage using Redis
import crypto from 'crypto';
import { getRedis } from './redis.js';
import { CONFIG } from '../config.js';
import { logger } from './logger.js';

const KEY_PREFIX = 'meterflow:apikey:';
const KEY_ID_PREFIX = 'meterflow:apikeyid:';
const WALLET_PREFIX = 'meterflow:wallet:';
const IS_PROD = process.env.NODE_ENV === 'production';

// In-memory fallback (dev only — production requires Redis)
const fallbackApiKeys = new Map();
const fallbackApiKeyIds = new Map();
const fallbackWalletKeys = new Map();

function parseLiveKey(apiKey = '') {
  const match = String(apiKey).match(/^mf_live_([A-Za-z0-9_-]{8,64})_([A-Za-z0-9_-]{16,})$/);
  return match ? { kid: match[1], secret: match[2] } : null;
}

function secretHash(secret, kid) {
  return crypto
    .createHmac('sha256', CONFIG.API_KEY_SECRET)
    .update(`${kid}.${secret}`)
    .digest('hex');
}

function keyRecordFor(apiKey, data) {
  const parsed = parseLiveKey(apiKey);
  if (!parsed) return { storageKey: `${KEY_PREFIX}${apiKey}`, data };
  return {
    storageKey: `${KEY_ID_PREFIX}${parsed.kid}`,
    data: {
      ...data,
      keyId: parsed.kid,
      keyHash: secretHash(parsed.secret, parsed.kid),
      keyVersion: 'hmac-v1',
    },
  };
}

function verifyLiveKey(apiKey, data) {
  const parsed = parseLiveKey(apiKey);
  if (!parsed || !data?.keyHash) return false;
  const expected = secretHash(parsed.secret, parsed.kid);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(data.keyHash));
  } catch {
    return false;
  }
}

/** Get key data by API key */
export async function getKeyData(apiKey) {
  const parsed = parseLiveKey(apiKey);
  const r = getRedis();
  if (!r) {
    if (parsed) {
      const data = fallbackApiKeyIds.get(parsed.kid) || null;
      return verifyLiveKey(apiKey, data) ? data : null;
    }
    return fallbackApiKeys.get(apiKey) || null;
  }

  try {
    if (parsed) {
      const data = await r.get(`${KEY_ID_PREFIX}${parsed.kid}`);
      if (data) {
        const row = JSON.parse(data);
        return verifyLiveKey(apiKey, row) ? row : null;
      }
      const fallback = fallbackApiKeyIds.get(parsed.kid) || null;
      return verifyLiveKey(apiKey, fallback) ? fallback : null;
    }
    const data = await r.get(`${KEY_PREFIX}${apiKey}`);
    if (data) return JSON.parse(data); // Legacy raw-key compatibility during migration.
    return fallbackApiKeys.get(apiKey) || null;
  } catch (e) {
    logger.error('KV-Keys failed to get key', { err: e.message });
    if (IS_PROD) throw new Error('Key store unavailable');
    return fallbackApiKeys.get(apiKey) || null;
  }
}

/** Store an API key */
export async function setKeyData(apiKey, data) {
  const record = keyRecordFor(apiKey, data);
  const parsed = parseLiveKey(apiKey);
  if (parsed) fallbackApiKeyIds.set(parsed.kid, record.data);
  else fallbackApiKeys.set(apiKey, data);
  const r = getRedis();
  if (!r) return;

  try {
    await r.set(record.storageKey, JSON.stringify(record.data));
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
    if (apiKey?.startsWith('mf_')) return apiKey;
    return fallbackWalletKeys.get(wallet) || null;
  } catch (e) {
    logger.error('KV-Keys failed to get wallet key', { err: e.message });
    if (IS_PROD) throw new Error('Key store unavailable');
    return fallbackWalletKeys.get(wallet) || null;
  }
}

/** Map wallet -> API key */
export async function setKeyForWallet(wallet, apiKey) {
  const parsed = parseLiveKey(apiKey);
  fallbackWalletKeys.set(wallet, parsed ? null : apiKey);
  const r = getRedis();
  if (!r) return;

  try {
    // New HMAC keys cannot be recovered after issuance, so only the public key id
    // is stored for wallet lookup. Legacy raw keys stay readable until migration.
    await r.set(`${WALLET_PREFIX}${wallet}`, parsed ? `kid:${parsed.kid}` : apiKey);
  } catch (e) {
    logger.error('KV-Keys failed to set wallet key', { err: e.message });
  }
}

/** Delete an API key and its wallet mapping */
export async function deleteKey(apiKey, wallet) {
  const parsed = parseLiveKey(apiKey);
  if (parsed) fallbackApiKeyIds.delete(parsed.kid);
  else fallbackApiKeys.delete(apiKey);
  if (wallet) fallbackWalletKeys.delete(wallet);
  const r = getRedis();
  if (!r) return;

  try {
    await r.del(parsed ? `${KEY_ID_PREFIX}${parsed.kid}` : `${KEY_PREFIX}${apiKey}`);
    if (wallet) await r.del(`${WALLET_PREFIX}${wallet}`);
  } catch (e) {
    logger.error('KV-Keys failed to delete key', { err: e.message });
  }
}

/** Check if an API key exists */
export async function hasKey(apiKey) {
  const parsed = parseLiveKey(apiKey);
  const r = getRedis();
  if (!r) return parsed ? !!fallbackApiKeyIds.get(parsed.kid) : fallbackApiKeys.has(apiKey);

  try {
    const exists = await r.exists(parsed ? `${KEY_ID_PREFIX}${parsed.kid}` : `${KEY_PREFIX}${apiKey}`);
    return exists === 1 || fallbackApiKeys.has(apiKey);
  } catch (e) {
    return fallbackApiKeys.has(apiKey);
  }
}

/** Count total issued keys (approximate — scans Redis) */
export async function countKeys() {
  const r = getRedis();
  if (!r) return fallbackApiKeys.size + fallbackApiKeyIds.size;

  try {
    let count = 0;
    let cursor = '0';
    do {
      const [next, keys] = await r.scan(cursor, 'MATCH', `meterflow:apikey*`, 'COUNT', 200);
      cursor = next;
      count += keys.length;
    } while (cursor !== '0');
    return Math.max(count, fallbackApiKeys.size + fallbackApiKeyIds.size);
  } catch (e) {
    return fallbackApiKeys.size + fallbackApiKeyIds.size;
  }
}
