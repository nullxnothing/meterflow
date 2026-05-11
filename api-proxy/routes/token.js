import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getDexMarket, getTokenSummary, getTopHolders, tokenConfig } from '../lib/token-profile.js';
import { logger } from '../lib/logger.js';

const router = Router();

const tokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many token data requests.' },
});

function handleTokenError(res, err) {
  if (err.code === 'token_not_configured') {
    return res.status(200).json({ configured: false, config: tokenConfig(), error: 'token_not_configured' });
  }
  logger.error('token route failed', { err: err.message });
  return res.status(502).json({ error: 'token_lookup_failed', message: 'Token data is temporarily unavailable.' });
}

router.get('/token/config', tokenLimiter, (_req, res) => {
  res.json(tokenConfig());
});

router.get('/token', tokenLimiter, async (req, res) => {
  try {
    const summary = await getTokenSummary({ refresh: req.query.refresh === '1' });
    res.json(summary);
  } catch (err) {
    handleTokenError(res, err);
  }
});

router.get('/token/holders', tokenLimiter, async (_req, res) => {
  try {
    const cfg = tokenConfig();
    if (!cfg.configured) return res.json({ configured: false, holders: [], config: cfg });
    const holders = await getTopHolders(cfg.mint);
    res.json({ configured: true, mint: cfg.mint, holders, updatedAt: new Date().toISOString() });
  } catch (err) {
    handleTokenError(res, err);
  }
});

router.get('/token/market', tokenLimiter, async (_req, res) => {
  try {
    const cfg = tokenConfig();
    if (!cfg.configured) return res.json({ configured: false, market: null, config: cfg });
    const market = await getDexMarket(cfg.mint);
    res.json({ configured: true, mint: cfg.mint, market, updatedAt: new Date().toISOString() });
  } catch (err) {
    handleTokenError(res, err);
  }
});

export default router;
