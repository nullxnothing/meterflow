import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { CONFIG, PROVIDER_AVAILABLE, isFreeAccessActive, getFreeAccessEndsAt } from '../config.js';
import { VALID_API_IDS, getTreasuryState, setTreasuryState } from '../state.js';
import { authenticateApiKey, authenticateAdmin } from '../middleware.js';
import { getTodayKey } from '../lib/helpers.js';
import { getTreasuryBalance } from '../lib/balance.js';
import { getVoteCounts, getWalletVotes, toggleVote } from '../lib/kv-votes.js';
import { getKeyData, countKeys } from '../lib/kv-keys.js';
import { getGlobalStats, getTopUsersToday, getModelAnalytics } from '../lib/kv-usage.js';
import { logger } from '../lib/logger.js';

const router = Router();

const startedAt = Date.now();

const BLENDED_COST = 0.02;
const TARGET_RUNWAY = 30;

// Rate limiter for public endpoints to prevent SCAN abuse
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many requests.' },
});

// Response cache for expensive public endpoints
let statsCache = { data: null, ts: 0 };
let treasuryCache = { data: null, ts: 0 };
const CACHE_TTL = 30_000; // 30s

/**
 * Compute treasury health metrics from balance, global stats, and agent-pushed state.
 * Used by both /treasury and /status/aggregate to avoid duplication.
 */
function computeTreasuryHealth(balance, globalStats, treasuryState) {
  let { multiplier, healthStatus, runwayDays, dailyBudget } = treasuryState;

  if (!treasuryState.updatedAt && balance.usd > 0) {
    const totalFundable = Math.floor(balance.usd / BLENDED_COST);
    dailyBudget = Math.floor(totalFundable / TARGET_RUNWAY);
    const dailySpend = (globalStats.todayCalls || 0) * BLENDED_COST;
    runwayDays = dailySpend <= 0 ? 999 : Math.round(balance.usd / dailySpend);

    if (runwayDays >= TARGET_RUNWAY * 2) { healthStatus = 'surplus'; multiplier = 1.5; }
    else if (runwayDays >= 7) { healthStatus = 'healthy'; multiplier = 1.0; }
    else if (runwayDays >= 3) { healthStatus = 'cautious'; multiplier = 0.7; }
    else { healthStatus = 'critical'; multiplier = 0.3; }
  }

  const tiers = Object.entries(CONFIG.TIERS).map(([key, t]) => ({
    name: t.label, key, min: t.min, dailyLimit: t.dailyLimit,
    effectiveLimit: Math.floor(t.dailyLimit * (multiplier || 1.0)),
    models: t.models,
  }));

  return { multiplier, healthStatus, runwayDays, dailyBudget, tiers };
}

// GET /stats
router.get('/stats', publicLimiter, async (req, res) => {
  if (statsCache.data && Date.now() - statsCache.ts < CACHE_TTL) {
    return res.json(statsCache.data);
  }

  const [totalKeysIssued, globalStats] = await Promise.all([countKeys(), getGlobalStats()]);
  const providers = {
    claude: PROVIDER_AVAILABLE.claude,
    gemini: PROVIDER_AVAILABLE.gemini,
    openai: PROVIDER_AVAILABLE.openai,
  };

  const data = {
    totalKeysIssued,
    totalCallsToday: globalStats.todayCalls,
    totalTokensToday: globalStats.todayTokens,
    allTimeCalls: globalStats.allTimeCalls,
    allTimeTokens: globalStats.allTimeTokens,
    activeProviders: Object.values(providers).filter(Boolean).length,
    providers,
    uptimeMs: Date.now() - startedAt,
    tokenMint: CONFIG.TOKEN_MINT || null,
    tiers: Object.entries(CONFIG.TIERS).map(([key, t]) => ({
      name: t.label, min: t.min, dailyLimit: t.dailyLimit, models: t.models,
    })),
  };

  statsCache = { data, ts: Date.now() };
  res.json(data);
});

// GET /votes
router.get('/votes', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let userVotes = [];
    if (authHeader?.startsWith('Bearer ')) {
      const keyData = await getKeyData(authHeader.split(' ')[1]);
      if (keyData) userVotes = await getWalletVotes(keyData.wallet);
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

// GET /admin/top-users
router.get('/admin/top-users', authenticateAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const topUsers = await getTopUsersToday(limit);
    const resolved = await Promise.all(
      topUsers.map(async (entry) => {
        const keyData = await getKeyData(entry.apiKey);
        return {
          wallet: keyData?.wallet || 'unknown',
          tier: keyData?.tier || 'unknown',
          calls: entry.count,
          tokens: entry.tokens,
          apiKeyPrefix: entry.apiKey.slice(0, 8) + '...',
        };
      })
    );
    res.json({ date: new Date().toISOString().split('T')[0], users: resolved });
  } catch (e) {
    logger.error('Failed to get top users', { err: e.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch top users' });
  }
});

// GET /admin/analytics — per-model stats (calls, tokens, errors, latency)
router.get('/admin/analytics', authenticateAdmin, async (req, res) => {
  try {
    const models = await getModelAnalytics();
    const globalStats = await getGlobalStats();
    res.json({
      date: new Date().toISOString().split('T')[0],
      global: globalStats,
      models,
    });
  } catch (e) {
    logger.error('Failed to get analytics', { err: e.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch analytics' });
  }
});

// POST /admin/rate-limits
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
  treasuryCache = { data: null, ts: 0 }; // bust cache on update
  logger.info('Rate limits updated', { multiplier, healthStatus, runwayDays });
  res.json({ ok: true, applied: getTreasuryState() });
});

// GET /treasury
router.get('/treasury', publicLimiter, async (req, res) => {
  if (treasuryCache.data && Date.now() - treasuryCache.ts < CACHE_TTL) {
    return res.json(treasuryCache.data);
  }

  const balance = await getTreasuryBalance();
  const treasuryState = getTreasuryState();
  const [totalKeysIssued, globalStats] = await Promise.all([countKeys(), getGlobalStats()]);
  const health = computeTreasuryHealth(balance, globalStats, treasuryState);

  const data = {
    ...treasuryState,
    ...health,
    treasuryBalanceSol: balance.sol,
    treasuryBalanceUsd: balance.usd,
    solPrice: balance.solPrice,
    wallet: CONFIG.TREASURY_WALLET || null,
    totalKeysIssued,
  };

  treasuryCache = { data, ts: Date.now() };
  res.json(data);
});

// GET /providers
router.get('/providers', (req, res) => {
  res.json({
    claude: PROVIDER_AVAILABLE.claude,
    gemini: PROVIDER_AVAILABLE.gemini,
    openai: PROVIDER_AVAILABLE.openai,
  });
});

// GET /status/aggregate
router.get('/status/aggregate', publicLimiter, async (req, res) => {
  const balance = await getTreasuryBalance();
  const treasuryState = getTreasuryState();
  const [totalKeysIssued, globalStats] = await Promise.all([countKeys(), getGlobalStats()]);
  const providers = {
    claude: PROVIDER_AVAILABLE.claude,
    gemini: PROVIDER_AVAILABLE.gemini,
    openai: PROVIDER_AVAILABLE.openai,
  };

  const health = computeTreasuryHealth(balance, globalStats, treasuryState);

  const response = {
    treasury: {
      ...treasuryState,
      ...health,
      treasuryBalanceSol: balance.sol,
      treasuryBalanceUsd: balance.usd,
      solPrice: balance.solPrice,
      wallet: CONFIG.TREASURY_WALLET || null,
      totalKeysIssued,
    },
    providers,
    health: { status: 'ok', version: '1.0.0', protocol: 'INFINITE', treasury: health.healthStatus },
  };

  if (isFreeAccessActive()) {
    response.freeAccessEndsAt = getFreeAccessEndsAt();
  }

  res.json(response);
});

// GET /health
router.get('/health', (req, res) => {
  const treasuryState = getTreasuryState();
  res.json({ status: 'ok', version: '1.0.0', protocol: 'INFINITE', treasury: treasuryState.healthStatus });
});

export default router;
