import { getRedis } from './redis.js';
import { logger } from './logger.js';

const WALLET_PREFIX = 'infinite:trading_wallet:';

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
