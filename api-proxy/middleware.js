import { timingSafeEqual } from 'crypto';
import { CONFIG, TRIAL_CONFIG, TRADING_TIERS, ALPHA_TIERS, FREE_ACCESS_TIER, isFreeAccessActive } from './config.js';
import { getTokenBalance } from './lib/balance.js';
import { getTierForBalance, getUsage, incrementUsage, getTodayKey } from './lib/helpers.js';
import { getKeyData } from './lib/kv-keys.js';
import { getTreasuryState } from './state.js';
import { logger } from './lib/logger.js';
import { authorizeMeteredRequest, recordReceipt } from './lib/control-plane.js';

async function authenticateApiKey(req, res, next) {
  if (req.meterflow?.paymentVerified) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'missing_api_key',
      message: 'Include your Meterflow API key as: Authorization: Bearer mf_xxxxx'
    });
  }

  const apiKey = authHeader.split(' ')[1];

  // pay.sh gateway path — payment already verified on-chain by the gateway
  if (CONFIG.PAY_SH_GATEWAY_SECRET && apiKey === CONFIG.PAY_SH_GATEWAY_SECRET) {
    req.meterflow = {
      apiKey: 'gateway',
      wallet: 'pay_sh_gateway',
      tier: 'operator',
      tierConfig: CONFIG.TIERS['operator'],
      isTrial: false,
      paymentVerified: true,
      usage: { count: 0, tokens: 0 },
    };
    const control = await authorizeMeteredRequest(req);
    req.meterflowControl = { ...control, paymentState: 'verified' };
    if (!control.allowed) {
      return res.status(control.status || 403).json({
        error: control.error || 'policy_denied',
        message: control.message || 'Request blocked by Meterflow policy.',
      });
    }
    return next();
  }

  const keyData = await getKeyData(apiKey);

  if (!keyData) {
    return res.status(401).json({
      error: 'invalid_api_key',
      message: 'API key not found. Generate one from the Meterflow dashboard.'
    });
  }

  const isGuest = !!keyData.guest || keyData.wallet?.startsWith('guest_');
  const isWhitelisted = !isGuest && CONFIG.WHITELISTED_WALLETS.has(keyData.wallet);

  let balance, tier;
  if (isGuest) {
    // Guest keys: no balance check, use free access tier while active, else reject
    if (!isFreeAccessActive()) {
      return res.status(403).json({
        error: 'free_access_expired',
        message: 'Free access has ended. Connect a wallet or use a paid Meterflow request flow for access.',
      });
    }
    balance = 0;
    tier = FREE_ACCESS_TIER;
  } else if (isWhitelisted) {
    balance = 0;
    tier = 'architect';
  } else {
    balance = await getTokenBalance(keyData.wallet);
    tier = getTierForBalance(balance) || 'trial';
  }

  keyData.tier = tier;
  keyData.balance = balance;

  const isTrial = tier === 'trial';
  const tierConfig = isTrial ? TRIAL_CONFIG : CONFIG.TIERS[tier];
  const usage = await getUsage(apiKey);
  const treasuryMultiplier = isTrial ? 1.0 : (getTreasuryState().multiplier || 1.0);
  const effectiveLimit = Math.floor(tierConfig.dailyLimit * treasuryMultiplier);

  if (usage.count >= effectiveLimit) {
    return res.status(429).json({
      error: isTrial ? 'trial_exhausted' : 'rate_limit_exceeded',
      message: isTrial
        ? `You've used all ${effectiveLimit} free trial calls for today. Use a Meterflow key or paid request flow for more access.`
        : `Daily limit of ${effectiveLimit.toLocaleString()} calls reached for ${tierConfig.label} tier.`,
      tier: tierConfig.label,
      limit: effectiveLimit,
      used: usage.count,
      isTrial,
      resetsAt: getTodayKey() + 'T00:00:00Z'
    });
  }

  req.meterflow = { apiKey, ...keyData, isTrial, tierConfig, usage };

  const control = await authorizeMeteredRequest(req);
  req.meterflowControl = control;
  if (!control.allowed) {
    await recordReceipt({
      meterId: control.meter?.id,
      route: control.meter?.route,
      method: control.meter?.method,
      status: control.error || 'policy_denied',
      amountUsd: 0,
      asset: control.meter?.asset || 'USDC',
      wallet: keyData.wallet,
      apiKey,
      agent: control.budget?.agentId || keyData.wallet,
      paymentState: 'not_required',
      policyResult: control.error || 'policy_denied',
      responseStatus: control.status || 403,
      error: control.message,
    });
    return res.status(control.status || 403).json({
      error: control.error || 'policy_denied',
      message: control.message || 'This request is blocked by the active Meterflow budget policy.',
      meter: control.meter ? { id: control.meter.id, route: control.meter.route, priceUsd: control.meter.priceUsd } : undefined,
      budget: control.budget ? { id: control.budget.id, dailyCapUsd: control.budget.dailyCapUsd, perCallCapUsd: control.budget.perCallCapUsd } : undefined,
    });
  }
  next();
}

function authenticateAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || adminKey === 'dev-admin-key') {
    return res.status(503).json({ error: 'admin_not_configured', message: 'ADMIN_KEY env var not set.' });
  }
  const key = req.headers.authorization?.split(' ')[1];
  if (!key || key.length !== adminKey.length ||
      !timingSafeEqual(Buffer.from(key), Buffer.from(adminKey))) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

function requireTradingTier(req, res, next) {
  const { tier } = req.meterflow;
  if (!TRADING_TIERS.includes(tier)) {
    return res.status(403).json({
      error: 'tier_restricted',
      message: 'Trading bot requires Operator tier or above.',
      requiredTier: 'Operator',
      currentTier: CONFIG.TIERS[tier]?.label || tier,
    });
  }
  next();
}

function requireAlphaTier(req, res, next) {
  const { tier } = req.meterflow;
  if (!ALPHA_TIERS.includes(tier)) {
    return res.status(403).json({
      error: 'tier_restricted',
      message: 'X Tools requires Alpha tier (10,000,000 MFLOW).',
      requiredTier: 'Alpha',
      requiredBalance: 10_000_000,
      currentTier: CONFIG.TIERS[tier]?.label || tier,
    });
  }
  next();
}

export { authenticateApiKey, authenticateAdmin, requireTradingTier, requireAlphaTier };
