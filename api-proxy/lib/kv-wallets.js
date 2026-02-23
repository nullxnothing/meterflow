import Redis from 'ioredis';
import { logger } from './logger.js';

const WALLET_PREFIX = 'infinite:trading_wallet:';
const IS_PROD = process.env.NODE_ENV === 'production';

let redis = null;

function getRedis() {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
    if (!redisUrl) return null;
    try {
      redis = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
      redis.on('error', (err) => logger.error('KV-Wallets Redis error', { err: err.message }));
    } catch (e) {
      logger.error('KV-Wallets Redis connect failed', { err: e.message });
      return null;
    }
  }
  return redis;
}

export async function persistWallet(apiKey, walletData) {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(`${WALLET_PREFIX}${apiKey}`, JSON.stringify(walletData));
  } catch (e) {
    logger.error('KV-Wallets persist failed', { err: e.message });
  }
}

export async function loadWallet(apiKey) {
  const r = getRedis();
  if (!r) return null;
  try {
    const data = await r.get(`${WALLET_PREFIX}${apiKey}`);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    logger.error('KV-Wallets load failed', { err: e.message });
    return null;
  }
}

export async function deleteWallet(apiKey) {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(`${WALLET_PREFIX}${apiKey}`);
  } catch (e) {
    logger.error('KV-Wallets delete failed', { err: e.message });
  }
}
