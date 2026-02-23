import { Router } from 'express';
import { CONFIG, PROVIDER_AVAILABLE } from '../config.js';
import { VALID_API_IDS, getTreasuryState, setTreasuryState } from '../state.js';
import { authenticateApiKey, authenticateAdmin } from '../middleware.js';
import { getTodayKey } from '../lib/helpers.js';
import { getTreasuryBalance } from '../lib/balance.js';
import { getVoteCounts, getWalletVotes, toggleVote } from '../lib/kv-votes.js';
import { getKeyData, countKeys } from '../lib/kv-keys.js';
import { getGlobalStats } from '../lib/kv-usage.js';
import { logger } from '../lib/logger.js';

const router = Router();

const startedAt = Date.now();

// GET /stats — public protocol metrics (no auth required)
router.get('/stats', async (req, res) => {
  const [totalKeysIssued, globalStats] = await Promise.all([
    countKeys(),
    getGlobalStats(),
  ]);

  const uptimeMs = Date.now() - startedAt;
  const providers = {
    claude: PROVIDER_AVAILABLE.claude,
    gemini: PROVIDER_AVAILABLE.gemini,
    openai: PROVIDER_AVAILABLE.openai,
  };
  const activeProviders = Object.values(providers).filter(Boolean).length;

  res.json({
    totalKeysIssued,
    totalCallsToday: globalStats.todayCalls,
    totalTokensToday: globalStats.todayTokens,
    allTimeCalls: globalStats.allTimeCalls,
    allTimeTokens: globalStats.allTimeTokens,
    activeProviders,
    providers,
    uptimeMs,
    tokenMint: CONFIG.TOKEN_MINT || null,
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
      const keyData = await getKeyData(authHeader.split(' ')[1]);
      if (keyData) {
        userVotes = await getWalletVotes(keyData.wallet);
      }
    }
    const counts = await getVoteCounts();
    res.json({ counts, userVotes });
  } catch (e) {
    logger.error('Failed to get votes', { err: e.message });
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
    logger.error('Failed to toggle vote', { err: e.message });
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

  logger.info('Rate limits updated', { multiplier, healthStatus, runwayDays });
  res.json({ ok: true, applied: getTreasuryState() });
});

// GET /treasury — Public treasury status (for dashboard)
router.get('/treasury', async (req, res) => {
  const balance = await getTreasuryBalance();
  const treasuryState = getTreasuryState();
  const totalKeysIssued = await countKeys();

  const tiers = Object.entries(CONFIG.TIERS).map(([key, t]) => ({
    name: t.label,
    key,
    min: t.min,
    dailyLimit: t.dailyLimit,
    effectiveLimit: Math.floor(t.dailyLimit * (treasuryState.multiplier || 1.0)),
    models: t.models,
  }));

  res.json({
    ...treasuryState,
    treasuryBalanceSol: balance.sol,
    treasuryBalanceUsd: balance.usd,
    solPrice: balance.solPrice,
    wallet: CONFIG.TREASURY_WALLET || null,
    totalKeysIssued,
    tiers,
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
