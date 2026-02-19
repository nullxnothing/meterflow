import { CONFIG, TRADING_TIERS } from './config.js';
import { getTokenBalance } from './lib/balance.js';
import { getTierForBalance, getUsage, incrementUsage, getTodayKey } from './lib/helpers.js';
import { getKeyData } from './lib/kv-keys.js';

async function authenticateApiKey(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'missing_api_key',
      message: 'Include your INFINITE API key as: Authorization: Bearer inf_xxxxx'
    });
  }

  const apiKey = authHeader.split(' ')[1];
  const keyData = await getKeyData(apiKey);

  if (!keyData) {
    return res.status(401).json({
      error: 'invalid_api_key',
      message: 'API key not found. Generate one at app.infinite.sh'
    });
  }

  const isWhitelisted = CONFIG.WHITELISTED_WALLETS.has(keyData.wallet);
  const balance = isWhitelisted ? 0 : await getTokenBalance(keyData.wallet);
  const tier = isWhitelisted ? 'architect' : getTierForBalance(balance);

  if (!tier) {
    return res.status(403).json({
      error: 'insufficient_balance',
      message: `Your wallet holds ${balance.toLocaleString()} $INFINITE. Minimum ${CONFIG.TIERS.signal.min.toLocaleString()} required.`,
      balance,
      required: CONFIG.TIERS.signal.min
    });
  }

  keyData.tier = tier;
  keyData.balance = balance;

  const usage = await getUsage(apiKey);
  const tierConfig = CONFIG.TIERS[tier];

  if (usage.count >= tierConfig.dailyLimit) {
    return res.status(429).json({
      error: 'rate_limit_exceeded',
      message: `Daily limit of ${tierConfig.dailyLimit.toLocaleString()} calls reached for ${tierConfig.label} tier.`,
      tier: tierConfig.label,
      limit: tierConfig.dailyLimit,
      used: usage.count,
      resetsAt: getTodayKey() + 'T00:00:00Z'
    });
  }

  req.infinite = { apiKey, ...keyData, tierConfig, usage };
  next();
}

function authenticateAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || adminKey === 'dev-admin-key') {
    return res.status(503).json({ error: 'admin_not_configured', message: 'ADMIN_KEY env var not set.' });
  }
  const key = req.headers.authorization?.split(' ')[1];
  if (key !== adminKey) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

function requireTradingTier(req, res, next) {
  const { tier } = req.infinite;
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

export { authenticateApiKey, authenticateAdmin, requireTradingTier };
