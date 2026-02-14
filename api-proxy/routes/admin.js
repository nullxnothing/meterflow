import { Router } from 'express';
import { CONFIG, PROVIDER_AVAILABLE } from '../config.js';
import { apiKeys, usageCounts, VALID_API_IDS, getTreasuryState, setTreasuryState } from '../state.js';
import { authenticateApiKey, authenticateAdmin } from '../middleware.js';
import { getTodayKey } from '../lib/helpers.js';
import { getTreasuryBalance } from '../lib/balance.js';
import { getVoteCounts, getWalletVotes, toggleVote } from '../lib/kv-votes.js';

const router = Router();

// GET /stats
router.get('/stats', (req, res) => {
  const today = getTodayKey();
  let totalCallsToday = 0;
  let totalTokensToday = 0;
  let activeKeys = 0;

  for (const [key, usage] of usageCounts) {
    if (usage.date === today) {
      totalCallsToday += usage.count;
      totalTokensToday += usage.tokens;
    }
  }

  for (const [key, data] of apiKeys) {
    if (data.tier) activeKeys++;
  }

  res.json({
    totalCallsToday,
    totalTokensToday,
    activeKeys,
    totalKeysIssued: apiKeys.size,
    tiers: Object.entries(CONFIG.TIERS).map(([key, t]) => ({
      name: t.label,
      min: t.min,
      dailyLimit: t.dailyLimit,
      models: t.models
    }))
  });
});

// GET /votes
router.get('/votes', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let userVotes = [];
    if (authHeader?.startsWith('Bearer ')) {
      const keyData = apiKeys.get(authHeader.split(' ')[1]);
      if (keyData) {
        userVotes = await getWalletVotes(keyData.wallet);
      }
    }
    const counts = await getVoteCounts();
    res.json({ counts, userVotes });
  } catch (e) {
    console.error('[Votes] Failed to get votes:', e);
    res.status(500).json({ error: 'internal_error', message: 'Failed to load votes' });
  }
});

// POST /votes
router.post('/votes', authenticateApiKey, async (req, res) => {
  try {
    const { apiId } = req.body;
    if (!apiId || !VALID_API_IDS.has(apiId)) {
      return res.status(400).json({ error: 'invalid_api_id', message: 'Unknown API ID' });
    }

    const { wallet } = req.infinite;
    const result = await toggleVote(wallet, apiId);
    res.json(result);
  } catch (e) {
    console.error('[Votes] Failed to toggle vote:', e);
    res.status(500).json({ error: 'internal_error', message: 'Failed to save vote' });
  }
});

// POST /admin/rate-limits — Treasury agent pushes updated rate limits
router.post('/admin/rate-limits', authenticateAdmin, (req, res) => {
  const { multiplier, healthStatus, runwayDays, dailyBudget, treasuryBalanceUsd } = req.body;

  setTreasuryState({
    multiplier: multiplier || 1.0,
    healthStatus: healthStatus || 'unknown',
    runwayDays: runwayDays || 0,
    dailyBudget: dailyBudget || 0,
    treasuryBalanceUsd: treasuryBalanceUsd || 0,
    updatedAt: Date.now(),
  });

  console.log(`[Admin] Rate limits updated: ${multiplier}x (${healthStatus}), runway: ${runwayDays} days`);
  res.json({ ok: true, applied: getTreasuryState() });
});

// GET /treasury — Public treasury status (for dashboard)
router.get('/treasury', async (req, res) => {
  const balance = await getTreasuryBalance();
  const treasuryState = getTreasuryState();
  res.json({
    ...treasuryState,
    treasuryBalanceSol: balance.sol,
    treasuryBalanceUsd: balance.usd,
    solPrice: balance.solPrice,
    wallet: CONFIG.TREASURY_WALLET ? CONFIG.TREASURY_WALLET.slice(0, 8) + '...' : null,
  });
});

// GET /providers — Provider status
router.get('/providers', (req, res) => {
  res.json({
    claude: PROVIDER_AVAILABLE.claude,
    gemini: PROVIDER_AVAILABLE.gemini,
    openai: PROVIDER_AVAILABLE.openai,
  });
});

// GET /health
router.get('/health', (req, res) => {
  const treasuryState = getTreasuryState();
  res.json({ status: 'ok', version: '1.0.0', protocol: 'INFINITE', treasury: treasuryState.healthStatus });
});

export default router;
