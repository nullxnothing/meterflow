import { Router } from 'express';
import { CONFIG, solanaConnection } from '../config.js';
import { tradingWallets } from '../state.js';
import { authenticateApiKey, requireTradingTier } from '../middleware.js';
import { getPositions, getHistory } from '../lib/trading-state.js';
import { getSolBalance } from '../trading/index.js';

const router = Router();

// GET /v1/trading/portfolio — all SPL token holdings + SOL balance with live prices
router.get('/portfolio', authenticateApiKey, requireTradingTier, async (req, res) => {
  const { apiKey } = req.infinite;
  const w = tradingWallets.get(apiKey);
  if (!w) return res.status(404).json({ error: 'no_wallet' });
  try {
    const solBalance = await getSolBalance(solanaConnection, w.publicKey);

    const taRes = await fetch(`https://mainnet.helius-rpc.com/?api-key=${CONFIG.HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 'portfolio',
        method: 'getTokenAccountsByOwner',
        params: [w.publicKey, { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' }, { encoding: 'jsonParsed' }]
      })
    });
    const taData = await taRes.json();
    const holdings = [];
    const mints = [];

    if (taData.result?.value) {
      for (const acct of taData.result.value) {
        const info = acct.account.data.parsed.info;
        const amount = parseFloat(info.tokenAmount.uiAmountString || '0');
        if (amount <= 0) continue;
        holdings.push({
          mint: info.mint,
          amount,
          decimals: info.tokenAmount.decimals,
        });
        mints.push(info.mint);
      }
    }

    let prices = {};
    if (mints.length > 0) {
      try {
        const priceRes = await fetch(`https://api.jup.ag/price/v3?ids=${mints.join(',')}`, {
          headers: CONFIG.JUPITER_API_KEY ? { 'x-api-key': CONFIG.JUPITER_API_KEY } : {},
        });
        prices = await priceRes.json();
      } catch {}
    }

    let totalValueUsd = solBalance * (prices['So11111111111111111111111111111111111111112']?.usdPrice || 0);
    const enriched = holdings.map(h => {
      const priceUsd = parseFloat(prices[h.mint]?.usdPrice || 0);
      const valueUsd = h.amount * priceUsd;
      totalValueUsd += valueUsd;
      return { ...h, priceUsd, valueUsd };
    }).sort((a, b) => b.valueUsd - a.valueUsd);

    let solPriceUsd = 0;
    try {
      const solPriceRes = await fetch('https://api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112', {
        headers: CONFIG.JUPITER_API_KEY ? { 'x-api-key': CONFIG.JUPITER_API_KEY } : {},
      });
      const solPriceData = await solPriceRes.json();
      solPriceUsd = parseFloat(solPriceData['So11111111111111111111111111111111111111112']?.usdPrice || 0);
    } catch {}

    res.json({
      publicKey: w.publicKey,
      solBalance,
      solPriceUsd,
      solValueUsd: solBalance * solPriceUsd,
      holdings: enriched,
      totalValueUsd: (solBalance * solPriceUsd) + enriched.reduce((s, h) => s + h.valueUsd, 0),
    });
  } catch (err) {
    res.status(502).json({ error: 'portfolio_fetch_failed', message: err.message });
  }
});

// GET /v1/trading/positions
router.get('/positions', authenticateApiKey, requireTradingTier, async (req, res) => {
  const { apiKey } = req.infinite;
  const positions = [...(await getPositions(apiKey)).entries()].map(([mint, p]) => ({ mint, ...p }));
  res.json(positions);
});

// GET /v1/trading/history
router.get('/history', authenticateApiKey, requireTradingTier, async (req, res) => {
  const { apiKey } = req.infinite;
  const limit = parseInt(req.query.limit) || 100;
  const hist = await getHistory(apiKey);
  res.json(hist.slice(-limit));
});

export default router;
