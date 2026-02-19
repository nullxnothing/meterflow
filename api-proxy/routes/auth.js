import { Router } from 'express';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { CONFIG } from '../config.js';
import { authenticateApiKey } from '../middleware.js';
import { getTokenBalance } from '../lib/balance.js';
import { generateApiKey, getTierForBalance } from '../lib/helpers.js';
import { isModelAvailable } from '../lib/providers.js';
import { getKeyData, setKeyData, getKeyForWallet, setKeyForWallet, deleteKey } from '../lib/kv-keys.js';
import { resetUsage } from '../lib/kv-usage.js';

const router = Router();

// POST /auth/register — Verify wallet ownership and issue API key
router.post('/register', async (req, res) => {
  const { wallet, signature, message } = req.body;

  if (!wallet || !signature || !message) {
    return res.status(400).json({
      error: 'missing_fields',
      message: 'Required: wallet, signature, message'
    });
  }

  try {
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

    if (!tier) {
      return res.status(403).json({
        error: 'insufficient_balance',
        message: `Wallet holds ${balance.toLocaleString()} $INFINITE. Minimum ${CONFIG.TIERS.signal.min.toLocaleString()} required.`,
        balance,
        tiers: Object.entries(CONFIG.TIERS).map(([key, t]) => ({
          name: t.label,
          min: t.min,
          dailyLimit: t.dailyLimit
        }))
      });
    }

    // Check for existing key
    let apiKey = await getKeyForWallet(wallet);
    if (apiKey) {
      const existing = await getKeyData(apiKey);
      if (existing) {
        existing.tier = tier;
        existing.balance = balance;
        await setKeyData(apiKey, existing);
        const allModels = CONFIG.TIERS[tier].models;
        return res.json({
          apiKey,
          tier: CONFIG.TIERS[tier].label,
          balance,
          dailyLimit: CONFIG.TIERS[tier].dailyLimit,
          models: allModels.filter(isModelAvailable),
          comingSoon: allModels.filter(m => !isModelAvailable(m)),
          message: 'Existing key returned. Tier updated.'
        });
      }
    }

    apiKey = generateApiKey();
    const keyData = { wallet, tier, balance, createdAt: Date.now() };
    await setKeyData(apiKey, keyData);
    await setKeyForWallet(wallet, apiKey);

    const allModels = CONFIG.TIERS[tier].models;
    res.json({
      apiKey,
      tier: CONFIG.TIERS[tier].label,
      balance,
      dailyLimit: CONFIG.TIERS[tier].dailyLimit,
      models: allModels.filter(isModelAvailable),
      comingSoon: allModels.filter(m => !isModelAvailable(m)),
      message: 'API key generated. Keep it safe.'
    });

  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'registration_failed', message: err.message });
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
