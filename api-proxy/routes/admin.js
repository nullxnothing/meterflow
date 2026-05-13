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
import { checkPostgresHealth } from '../lib/postgres.js';
import { checkRedisHealth } from '../lib/redis.js';
import { captureError, flushSentry } from '../lib/sentry.js';
import { listMeters, listReceipts } from '../lib/control-plane.js';

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
  } else if (!treasuryState.updatedAt && CONFIG.TREASURY_WALLET && balance.usd <= 0) {
    healthStatus = 'empty';
    runwayDays = 0;
    dailyBudget = 0;
    multiplier = 1.0;
  }

  const tiers = Object.entries(CONFIG.TIERS).map(([key, t]) => ({
    name: t.label, key, min: t.min, dailyLimit: t.dailyLimit,
    effectiveLimit: Math.floor(t.dailyLimit * (multiplier || 1.0)),
    models: t.models,
  }));

  return { multiplier, healthStatus, runwayDays, dailyBudget, tiers };
}

function buildDailySeries(receipts, predicate = () => true, days = 30) {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const buckets = new Map();

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - i);
    buckets.set(date.toISOString().slice(0, 10), 0);
  }

  receipts.forEach(receipt => {
    if (!predicate(receipt)) return;
    const created = new Date(receipt.createdAt || 0);
    if (Number.isNaN(created.getTime())) return;
    const key = created.toISOString().slice(0, 10);
    if (!buckets.has(key)) return;
    buckets.set(key, buckets.get(key) + 1);
  });

  return Array.from(buckets, ([date, value]) => ({ date, value }));
}

async function getControlPlaneTelemetry() {
  const [meters, receipts] = await Promise.all([
    listMeters(),
    listReceipts({ limit: 500 }),
  ]);

  const isTest = receipt => receipt.status === 'test_quote' || receipt.paymentState === 'test_quote' || receipt.paymentMethod === 'dashboard_test';
  const isVerified = receipt => receipt.status === 'verified' || receipt.paymentState === 'verified' || Boolean(receipt.txSignature);
  const isFailed = receipt => String(receipt.status || '').includes('failed') || String(receipt.paymentState || '').includes('failed');

  const verifiedReceipts = receipts.filter(isVerified);
  const testReceipts = receipts.filter(isTest);
  const failedReceipts = receipts.filter(isFailed);
  const billableReceipts = receipts.filter(receipt => receipt.status === 'metered_key' || isVerified(receipt));

  return {
    meters: {
      total: meters.length,
      active: meters.filter(meter => meter.status !== 'disabled').length,
    },
    receipts: {
      total: receipts.length,
      billable: billableReceipts.length,
      verified: verifiedReceipts.length,
      test: testReceipts.length,
      failed: failedReceipts.length,
      today: buildDailySeries(receipts, () => true, 1)[0]?.value || 0,
      estimatedUsd: Number(billableReceipts.reduce((sum, receipt) => sum + Number(receipt.amountUsd || 0), 0).toFixed(6)),
      verifiedUsd: Number(verifiedReceipts.reduce((sum, receipt) => sum + Number(receipt.amountUsd || 0), 0).toFixed(6)),
      withTxSignature: receipts.filter(receipt => receipt.txSignature || receipt.paymentReference).length,
      series30d: buildDailySeries(receipts),
      verifiedSeries30d: buildDailySeries(receipts, isVerified),
    },
  };
}

function getOpsReadiness() {
  return {
    errorAlertWebhookConfigured: !!process.env.ERROR_ALERT_WEBHOOK,
    sentryConfigured: !!process.env.SENTRY_DSN,
    x402PayToConfigured: !!(process.env.X402_PAY_TO || CONFIG.TREASURY_WALLET),
  };
}

// GET /stats
router.get('/stats', publicLimiter, async (req, res) => {
  if (statsCache.data && Date.now() - statsCache.ts < CACHE_TTL) {
    return res.json(statsCache.data);
  }

  const [totalKeysIssued, globalStats, controlPlane] = await Promise.all([
    countKeys(),
    getGlobalStats(),
    getControlPlaneTelemetry(),
  ]);
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
    controlPlane,
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
    const { wallet } = req.meterflow;
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

// POST /admin/sentry-test
router.post('/admin/sentry-test', authenticateAdmin, async (req, res) => {
  const err = new Error('Meterflow controlled Sentry test event');
  err.name = 'MeterflowSentryTest';
  captureError(err, {
    route: '/admin/sentry-test',
    runtime: process.env.VERCEL ? 'vercel' : 'node',
    requestedBy: 'admin',
  });
  await flushSentry(2000);
  res.json({ ok: true, sentryConfigured: !!process.env.SENTRY_DSN });
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
    treasuryBalanceUsdc: balance.usdc,
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
      treasuryBalanceUsdc: balance.usdc,
      treasuryBalanceUsd: balance.usd,
      solPrice: balance.solPrice,
      wallet: CONFIG.TREASURY_WALLET || null,
      totalKeysIssued,
    },
    providers,
    health: { status: 'ok', version: '1.0.0', protocol: 'Meterflow', treasury: health.healthStatus },
  };

  if (isFreeAccessActive()) {
    response.freeAccessEndsAt = getFreeAccessEndsAt();
  }

  res.json(response);
});

// GET /health
router.get('/health', async (req, res) => {
  const treasuryState = getTreasuryState();
  const [redis, postgres, balance, globalStats] = await Promise.all([
    checkRedisHealth(),
    checkPostgresHealth(),
    getTreasuryBalance(),
    getGlobalStats(),
  ]);
  const treasury = computeTreasuryHealth(balance, globalStats, treasuryState);
  const storageOk = redis.connected && (!postgres.configured || (postgres.connected && postgres.migrated));
  res.status(storageOk ? 200 : 503).json({
    status: storageOk ? 'ok' : 'degraded',
    version: '1.0.0',
    protocol: 'Meterflow',
    treasury: treasury.healthStatus,
    ops: getOpsReadiness(),
    storage: { redis, postgres },
  });
});

export default router;
