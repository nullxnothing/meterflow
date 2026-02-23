import { Router } from 'express';
import { CONFIG } from '../config.js';
import { logger } from '../lib/logger.js';

const router = Router();

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${CONFIG.HELIUS_API_KEY}`;
const TOKEN_MINT = CONFIG.TOKEN_MINT;

// In-memory cache for trades
let tradesCache = { trades: [], fetchedAt: 0 };
const CACHE_TTL = 4_000; // 4 seconds

async function fetchRecentTrades() {
  if (Date.now() - tradesCache.fetchedAt < CACHE_TTL) {
    return tradesCache.trades;
  }

  try {
    // Get recent signatures for the token mint
    const sigRes = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'trade-sigs',
        method: 'getSignaturesForAddress',
        params: [TOKEN_MINT, { limit: 30 }]
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const sigData = await sigRes.json();
    const signatures = (sigData.result || [])
      .filter(s => !s.err)
      .map(s => s.signature);

    if (!signatures.length) return tradesCache.trades;

    // Parse transactions via Helius Enhanced API
    const parseRes = await fetch(`https://api.helius.xyz/v0/transactions?api-key=${CONFIG.HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: signatures }),
      signal: AbortSignal.timeout(10_000),
    });
    const parsed = await parseRes.json();

    const trades = [];
    for (const tx of parsed) {
      if (!tx.type || tx.type === 'UNKNOWN') continue;

      const isSwap = tx.type === 'SWAP';
      const isTransfer = tx.type === 'TRANSFER';
      if (!isSwap && !isTransfer) continue;

      // For swaps, check tokenTransfers and nativeTransfers
      const tokenTransfers = tx.tokenTransfers || [];
      const nativeTransfers = tx.nativeTransfers || [];

      // Find the token transfer involving our mint
      const tokenTx = tokenTransfers.find(t => t.mint === TOKEN_MINT);
      if (!tokenTx) continue;

      // Determine buy vs sell
      // Buy = user receives tokens (toUserAccount has tokens)
      // Sell = user sends tokens (fromUserAccount sends tokens)
      const feePayer = tx.feePayer || '';
      const isBuy = tokenTx.toUserAccount === feePayer || tokenTx.fromUserAccount !== feePayer;

      // Get SOL amount from native transfers
      let solAmount = 0;
      for (const nt of nativeTransfers) {
        if (nt.fromUserAccount === feePayer || nt.toUserAccount === feePayer) {
          solAmount = Math.max(solAmount, Math.abs(nt.amount) / 1e9);
        }
      }

      // If swap, try to get SOL from swap data
      if (isSwap && tx.events?.swap) {
        const swap = tx.events.swap;
        const nativeIn = swap.nativeInput;
        const nativeOut = swap.nativeOutput;
        if (nativeIn?.amount) solAmount = nativeIn.amount / 1e9;
        if (nativeOut?.amount) solAmount = nativeOut.amount / 1e9;
      }

      trades.push({
        txType: isBuy ? 'buy' : 'sell',
        signature: tx.signature,
        solAmount,
        tokenAmount: tokenTx.tokenAmount,
        traderPublicKey: feePayer,
        timestamp: (tx.timestamp || 0) * 1000,
        type: tx.type,
      });
    }

    tradesCache = { trades, fetchedAt: Date.now() };
    return trades;
  } catch (err) {
    logger.error('Failed to fetch trades', { err: err.message });
    return tradesCache.trades;
  }
}

// GET /v1/trades/live — public endpoint (no auth needed for live feed)
router.get('/trades/live', async (req, res) => {
  try {
    const trades = await fetchRecentTrades();
    res.json({ trades, cached: Date.now() - tradesCache.fetchedAt < 1000 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});

export default router;
