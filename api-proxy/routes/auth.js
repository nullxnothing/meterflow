import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { CONFIG, TRIAL_CONFIG, isFreeAccessActive, getFreeAccessEndsAt } from '../config.js';
import { authenticateApiKey } from '../middleware.js';
import { getTokenBalance } from '../lib/balance.js';
import { generateApiKey, getTierForBalance } from '../lib/helpers.js';
import { isModelAvailable } from '../lib/providers.js';
import { getKeyData, setKeyData, getKeyForWallet, setKeyForWallet, deleteKey } from '../lib/kv-keys.js';
import { deleteWallet } from '../lib/kv-wallets.js';
import { logger } from '../lib/logger.js';
import { resetUsage } from '../lib/kv-usage.js';

const router = Router();

const SIG_MAX_AGE_MS = 5 * 60 * 1000;

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many registration attempts. Try again in 15 minutes.' },
});

/**
 * Shared wallet verification + key issuance logic.
 * @param {{ wallet, signature, message }} params
 * @param {{ source?: string, extraResponse?: object }} opts
 * @returns {{ status: number, body: object }}
 */
async function registerWallet({ wallet, signature, message }, opts = {}) {
  const tsMatch = message.match(/Timestamp:\s*(\d+)/);
  if (!tsMatch) {
    return { status: 400, body: { error: 'invalid_message', message: 'Signed message must include a Timestamp field.' } };
  }
  const sigTimestamp = parseInt(tsMatch[1], 10);
  if (Math.abs(Date.now() - sigTimestamp) > SIG_MAX_AGE_MS) {
    return { status: 401, body: { error: 'signature_expired', message: 'Signature has expired. Please sign a new message.' } };
  }

  let sigBytes;
  try {
    sigBytes = bs58.decode(signature);
  } catch {
    sigBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
  }

  const verified = nacl.sign.detached.verify(
    new TextEncoder().encode(message),
    sigBytes,
    bs58.decode(wallet)
  );

  if (!verified) {
    return { status: 401, body: { error: 'invalid_signature', message: 'Wallet signature verification failed.' } };
  }

  const isWhitelisted = CONFIG.WHITELISTED_WALLETS.has(wallet);
  const balance = isWhitelisted ? 0 : await getTokenBalance(wallet);
  const tier = isWhitelisted ? 'architect' : getTierForBalance(balance);
  const effectiveTier = tier || 'trial';
  const tierConfig = effectiveTier === 'trial' ? TRIAL_CONFIG : CONFIG.TIERS[effectiveTier];
  const freeAccess = !isWhitelisted && balance < (CONFIG.TIERS.signal?.min || 10000) && isFreeAccessActive();

  let apiKey = await getKeyForWallet(wallet);
  if (apiKey) {
    const existing = await getKeyData(apiKey);
    if (existing) {
      existing.tier = effectiveTier;
      existing.balance = balance;
      await setKeyData(apiKey, existing);
      return {
        status: 200,
        body: {
          apiKey,
          tier: tierConfig.label,
          balance,
          dailyLimit: tierConfig.dailyLimit,
          models: tierConfig.models.filter(isModelAvailable),
          comingSoon: tierConfig.models.filter(m => !isModelAvailable(m)),
          isTrial: effectiveTier === 'trial',
          freeAccess,
          freeAccessEndsAt: freeAccess ? getFreeAccessEndsAt() : undefined,
          message: freeAccess
            ? 'Free access granted! Hold $INFINITE tokens before it expires to keep access.'
            : 'Existing key returned. Tier updated.',
          ...opts.extraResponse,
        },
      };
    }
  }

  apiKey = generateApiKey();
  const keyData = { wallet, tier: effectiveTier, balance, createdAt: Date.now() };
  if (opts.source) keyData.source = opts.source;
  await setKeyData(apiKey, keyData);
  await setKeyForWallet(wallet, apiKey);

  if (opts.source) {
    logger.info('Agent registered', { wallet: wallet.slice(0, 8), tier: effectiveTier, source: opts.source });
  }

  return {
    status: 200,
    body: {
      apiKey,
      tier: tierConfig.label,
      balance,
      dailyLimit: tierConfig.dailyLimit,
      models: tierConfig.models.filter(isModelAvailable),
      comingSoon: tierConfig.models.filter(m => !isModelAvailable(m)),
      isTrial: effectiveTier === 'trial',
      freeAccess,
      freeAccessEndsAt: freeAccess ? getFreeAccessEndsAt() : undefined,
      message: freeAccess
        ? 'Free access granted! Hold $INFINITE tokens before it expires to keep access.'
        : effectiveTier === 'trial'
          ? 'Trial access granted. Hold $INFINITE tokens for full access.'
          : 'API key generated. Keep it safe.',
      ...opts.extraResponse,
    },
  };
}

// POST /auth/register
router.post('/register', registerLimiter, async (req, res) => {
  const { wallet, signature, message } = req.body;
  if (!wallet || !signature || !message) {
    return res.status(400).json({ error: 'missing_fields', message: 'Required: wallet, signature, message' });
  }
  try {
    const result = await registerWallet({ wallet, signature, message });
    res.status(result.status).json(result.body);
  } catch (err) {
    logger.error('Registration error', { err: err.message });
    res.status(500).json({
      error: 'registration_failed',
      message: process.env.NODE_ENV === 'production' ? 'Registration failed. Try again.' : err.message,
    });
  }
});

// GET /auth/status
router.get('/status', authenticateApiKey, (req, res) => {
  const { wallet, tier, balance, tierConfig, usage } = req.infinite;
  const freeActive = isFreeAccessActive();
  const isFreeUser = freeActive && balance < (CONFIG.TIERS.signal?.min || 10000) && tier !== 'trial';
  res.json({
    wallet,
    tier: tierConfig.label,
    balance,
    usage: { today: usage.count, limit: tierConfig.dailyLimit, remaining: tierConfig.dailyLimit - usage.count },
    models: tierConfig.models.filter(isModelAvailable),
    comingSoon: tierConfig.models.filter(m => !isModelAvailable(m)),
    freeAccess: isFreeUser,
    freeAccessEndsAt: isFreeUser ? getFreeAccessEndsAt() : undefined,
  });
});

// POST /auth/agent-register
router.post('/agent-register', registerLimiter, async (req, res) => {
  const { wallet, signature, message } = req.body;
  if (!wallet || !signature || !message) {
    return res.status(400).json({
      error: 'missing_fields',
      message: 'Required: wallet (base58 public key), signature (base58 Ed25519 sig), message (signed text with Timestamp)',
      example: {
        wallet: '<solana-public-key>',
        signature: '<base58-signature>',
        message: 'INFINITE Protocol Agent Registration\nWallet: <public-key>\nTimestamp: <unix-ms>',
      },
    });
  }
  try {
    const result = await registerWallet(
      { wallet, signature, message },
      { source: 'agent', extraResponse: { tokenMint: CONFIG.TOKEN_MINT, dashboard: 'https://infinitekeys.fun' } },
    );
    res.status(result.status).json(result.body);
  } catch (err) {
    logger.error('Agent registration error', { err: err.message });
    res.status(500).json({
      error: 'registration_failed',
      message: process.env.NODE_ENV === 'production' ? 'Registration failed. Try again.' : err.message,
    });
  }
});

// GET /auth/tiers
router.get('/tiers', (_req, res) => {
  const tiers = Object.entries(CONFIG.TIERS).map(([key, tier]) => ({
    id: key,
    label: tier.label,
    minTokens: tier.min,
    dailyLimit: tier.dailyLimit,
    models: tier.models.filter(isModelAvailable),
  }));

  res.json({
    tokenMint: CONFIG.TOKEN_MINT,
    tokenSymbol: 'INF',
    chain: 'solana',
    dashboard: 'https://infinitekeys.fun',
    tiers: [
      { id: 'trial', label: 'Trial', minTokens: 0, dailyLimit: TRIAL_CONFIG.dailyLimit, models: TRIAL_CONFIG.models },
      ...tiers,
    ],
  });
});

// POST /auth/revoke — also cleans up trading wallet
router.post('/revoke', authenticateApiKey, async (req, res) => {
  const { apiKey, wallet } = req.infinite;
  await deleteKey(apiKey, wallet);
  await Promise.all([resetUsage(apiKey), deleteWallet(apiKey)]);
  res.json({ message: 'API key revoked. Generate a new one at any time.' });
});

// POST /auth/rotate — also cleans up old trading wallet
router.post('/rotate', authenticateApiKey, async (req, res) => {
  const { apiKey: oldKey, wallet, tier, balance } = req.infinite;

  await deleteKey(oldKey, wallet);
  await Promise.all([resetUsage(oldKey), deleteWallet(oldKey)]);

  const newKey = generateApiKey();
  await setKeyData(newKey, { wallet, tier, balance, createdAt: Date.now() });
  await setKeyForWallet(wallet, newKey);

  res.json({
    apiKey: newKey,
    tier: CONFIG.TIERS[tier].label,
    message: 'New key issued. Old key is now invalid.'
  });
});

export default router;
