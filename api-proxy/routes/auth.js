import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { CONFIG, TRIAL_CONFIG } from '../config.js';
import { authenticateApiKey } from '../middleware.js';
import { getTokenBalance } from '../lib/balance.js';
import { generateApiKey, getTierForBalance } from '../lib/helpers.js';
import { isModelAvailable } from '../lib/providers.js';
import { getKeyData, setKeyData, getKeyForWallet, setKeyForWallet, deleteKey } from '../lib/kv-keys.js';
import { logger } from '../lib/logger.js';
import { resetUsage } from '../lib/kv-usage.js';

const router = Router();

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many registration attempts. Try again in 15 minutes.' },
});

// POST /auth/register — Verify wallet ownership and issue API key
router.post('/register', registerLimiter, async (req, res) => {
  const { wallet, signature, message } = req.body;

  if (!wallet || !signature || !message) {
    return res.status(400).json({
      error: 'missing_fields',
      message: 'Required: wallet, signature, message'
    });
  }

  try {
    // Replay protection: require timestamp in signed message, reject if > 5 min old
    const SIG_MAX_AGE_MS = 5 * 60 * 1000;
    const tsMatch = message.match(/Timestamp:\s*(\d+)/);
    if (!tsMatch) {
      return res.status(400).json({
        error: 'invalid_message',
        message: 'Signed message must include a Timestamp field.',
      });
    }
    const sigTimestamp = parseInt(tsMatch[1], 10);
    if (Math.abs(Date.now() - sigTimestamp) > SIG_MAX_AGE_MS) {
      return res.status(401).json({
        error: 'signature_expired',
        message: 'Signature has expired. Please sign a new message.',
      });
    }

    // Dashboard sends base64, CLI clients may send base58
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
      return res.status(401).json({
        error: 'invalid_signature',
        message: 'Wallet signature verification failed.'
      });
    }

    // Whitelisted wallets bypass balance check (pre-launch testing)
    const isWhitelisted = CONFIG.WHITELISTED_WALLETS.has(wallet);

    const balance = isWhitelisted ? 0 : await getTokenBalance(wallet);
    const tier = isWhitelisted ? 'architect' : getTierForBalance(balance);

    // Determine effective tier — insufficient balance gets trial
    const effectiveTier = tier || 'trial';
    const tierConfig = effectiveTier === 'trial' ? TRIAL_CONFIG : CONFIG.TIERS[effectiveTier];

    // Check for existing key
    let apiKey = await getKeyForWallet(wallet);
    if (apiKey) {
      const existing = await getKeyData(apiKey);
      if (existing) {
        existing.tier = effectiveTier;
        existing.balance = balance;
        await setKeyData(apiKey, existing);
        return res.json({
          apiKey,
          tier: tierConfig.label,
          balance,
          dailyLimit: tierConfig.dailyLimit,
          models: tierConfig.models.filter(isModelAvailable),
          comingSoon: tierConfig.models.filter(m => !isModelAvailable(m)),
          isTrial: effectiveTier === 'trial',
          message: 'Existing key returned. Tier updated.'
        });
      }
    }

    apiKey = generateApiKey();
    const keyData = { wallet, tier: effectiveTier, balance, createdAt: Date.now() };
    await setKeyData(apiKey, keyData);
    await setKeyForWallet(wallet, apiKey);

    res.json({
      apiKey,
      tier: tierConfig.label,
      balance,
      dailyLimit: tierConfig.dailyLimit,
      models: tierConfig.models.filter(isModelAvailable),
      comingSoon: tierConfig.models.filter(m => !isModelAvailable(m)),
      isTrial: effectiveTier === 'trial',
      message: effectiveTier === 'trial'
        ? 'Trial access granted. Hold $INFINITE tokens for full access.'
        : 'API key generated. Keep it safe.'
    });

  } catch (err) {
    logger.error('Registration error', { err: err.message });
    res.status(500).json({
      error: 'registration_failed',
      message: process.env.NODE_ENV === 'production' ? 'Registration failed. Try again.' : err.message,
    });
  }
});

// GET /auth/status — Check current key status
router.get('/status', authenticateApiKey, (req, res) => {
  const { wallet, tier, balance, tierConfig, usage } = req.infinite;
  res.json({
    wallet,
    tier: tierConfig.label,
    balance,
    usage: {
      today: usage.count,
      limit: tierConfig.dailyLimit,
      remaining: tierConfig.dailyLimit - usage.count
    },
    models: tierConfig.models.filter(isModelAvailable),
    comingSoon: tierConfig.models.filter(m => !isModelAvailable(m)),
  });
});

// POST /auth/agent-register — Programmatic agent registration (same logic, aliased for discovery)
// OpenClaw skills and autonomous agents use this endpoint to onboard.
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
    const SIG_MAX_AGE_MS = 5 * 60 * 1000;
    const tsMatch = message.match(/Timestamp:\s*(\d+)/);
    if (!tsMatch) {
      return res.status(400).json({
        error: 'invalid_message',
        message: 'Signed message must include a Timestamp field.',
      });
    }
    const sigTimestamp = parseInt(tsMatch[1], 10);
    if (Math.abs(Date.now() - sigTimestamp) > SIG_MAX_AGE_MS) {
      return res.status(401).json({
        error: 'signature_expired',
        message: 'Signature has expired. Please sign a new message.',
      });
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
      return res.status(401).json({
        error: 'invalid_signature',
        message: 'Wallet signature verification failed.',
      });
    }

    const isWhitelisted = CONFIG.WHITELISTED_WALLETS.has(wallet);
    const balance = isWhitelisted ? 0 : await getTokenBalance(wallet);
    const tier = isWhitelisted ? 'architect' : getTierForBalance(balance);
    const effectiveTier = tier || 'trial';
    const tierConfig = effectiveTier === 'trial' ? TRIAL_CONFIG : CONFIG.TIERS[effectiveTier];

    let apiKey = await getKeyForWallet(wallet);
    if (apiKey) {
      const existing = await getKeyData(apiKey);
      if (existing) {
        existing.tier = effectiveTier;
        existing.balance = balance;
        await setKeyData(apiKey, existing);
        return res.json({
          apiKey,
          tier: tierConfig.label,
          balance,
          dailyLimit: tierConfig.dailyLimit,
          models: tierConfig.models.filter(isModelAvailable),
          isTrial: effectiveTier === 'trial',
          tokenMint: CONFIG.TOKEN_MINT,
          dashboard: 'https://infinitekeys.fun',
          message: 'Existing key returned. Tier updated.',
        });
      }
    }

    apiKey = generateApiKey();
    const keyData = { wallet, tier: effectiveTier, balance, createdAt: Date.now(), source: 'agent' };
    await setKeyData(apiKey, keyData);
    await setKeyForWallet(wallet, apiKey);

    logger.info('Agent registered', { wallet: wallet.slice(0, 8), tier: effectiveTier, source: 'agent' });

    res.json({
      apiKey,
      tier: tierConfig.label,
      balance,
      dailyLimit: tierConfig.dailyLimit,
      models: tierConfig.models.filter(isModelAvailable),
      isTrial: effectiveTier === 'trial',
      tokenMint: CONFIG.TOKEN_MINT,
      dashboard: 'https://infinitekeys.fun',
      message: effectiveTier === 'trial'
        ? 'Trial access granted. Buy $INF tokens for full access.'
        : 'API key generated. Store it securely.',
    });
  } catch (err) {
    logger.error('Agent registration error', { err: err.message });
    res.status(500).json({
      error: 'registration_failed',
      message: process.env.NODE_ENV === 'production' ? 'Registration failed. Try again.' : err.message,
    });
  }
});

// GET /auth/tiers — Public endpoint for agents to discover tier requirements
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

// POST /auth/revoke — Revoke your own key
router.post('/revoke', authenticateApiKey, async (req, res) => {
  const { apiKey, wallet } = req.infinite;
  await deleteKey(apiKey, wallet);
  await resetUsage(apiKey);
  res.json({ message: 'API key revoked. Generate a new one at any time.' });
});

// POST /auth/rotate — Get a new key (revokes old one)
router.post('/rotate', authenticateApiKey, async (req, res) => {
  const { apiKey: oldKey, wallet, tier, balance } = req.infinite;

  await deleteKey(oldKey, wallet);
  await resetUsage(oldKey);

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
