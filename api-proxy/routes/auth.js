import { Router } from 'express';
import { CONFIG } from '../config.js';
import { apiKeys, walletKeys, usageCounts } from '../state.js';
import { authenticateApiKey } from '../middleware.js';
import { getTokenBalance } from '../lib/balance.js';
import { generateApiKey, getTierForBalance } from '../lib/helpers.js';
import { isModelAvailable } from '../lib/providers.js';

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
    // TODO: Full signature verification with tweetnacl
    // const verified = nacl.sign.detached.verify(
    //   new TextEncoder().encode(message),
    //   bs58.decode(signature),
    //   bs58.decode(wallet)
    // );

    const balance = await getTokenBalance(wallet);
    const tier = getTierForBalance(balance);

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

    let apiKey = walletKeys.get(wallet);
    if (apiKey && apiKeys.has(apiKey)) {
      const existing = apiKeys.get(apiKey);
      existing.tier = tier;
      existing.balance = balance;
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

    apiKey = generateApiKey();
    apiKeys.set(apiKey, {
      wallet,
      tier,
      balance,
      createdAt: Date.now()
    });
    walletKeys.set(wallet, apiKey);

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
router.post('/revoke', authenticateApiKey, (req, res) => {
  const { apiKey, wallet } = req.infinite;
  apiKeys.delete(apiKey);
  walletKeys.delete(wallet);
  usageCounts.delete(apiKey);
  res.json({ message: 'API key revoked. Generate a new one at any time.' });
});

// POST /auth/rotate — Get a new key (revokes old one)
router.post('/rotate', authenticateApiKey, async (req, res) => {
  const { apiKey: oldKey, wallet, tier, balance } = req.infinite;

  apiKeys.delete(oldKey);
  usageCounts.delete(oldKey);

  const newKey = generateApiKey();
  apiKeys.set(newKey, { wallet, tier, balance, createdAt: Date.now() });
  walletKeys.set(wallet, newKey);

  res.json({
    apiKey: newKey,
    tier: CONFIG.TIERS[tier].label,
    message: 'New key issued. Old key is now invalid.'
  });
});

export default router;
