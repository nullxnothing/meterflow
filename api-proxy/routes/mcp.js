import { Router } from 'express';
import { authenticateApiKey } from '../middleware.js';
import { completeMeteredRequest } from '../lib/control-plane.js';
import { logger } from '../lib/logger.js';

const router = Router();
export const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function scoreRisk(pair) {
  const liquidityUsd = Number(pair?.liquidity?.usd || 0);
  const fdv = Number(pair?.fdv || 0);
  const volume24h = Number(pair?.volume?.h24 || 0);
  const txns24h = Number(pair?.txns?.h24?.buys || 0) + Number(pair?.txns?.h24?.sells || 0);
  const ageMs = Date.now() - Number(pair?.pairCreatedAt || Date.now());
  const ageHours = Math.max(ageMs / 3_600_000, 0);

  let risk = 35;
  const reasons = [];

  if (liquidityUsd < 5_000) {
    risk += 30;
    reasons.push('Very low liquidity');
  } else if (liquidityUsd < 25_000) {
    risk += 15;
    reasons.push('Thin liquidity');
  } else {
    risk -= 10;
    reasons.push('Meaningful liquidity');
  }

  if (ageHours < 6) {
    risk += 20;
    reasons.push('New pair');
  } else if (ageHours > 168) {
    risk -= 10;
    reasons.push('Pair older than one week');
  }

  if (fdv > 0 && liquidityUsd > 0 && fdv / liquidityUsd > 100) {
    risk += 15;
    reasons.push('FDV is high relative to liquidity');
  }

  if (volume24h > liquidityUsd * 3 && liquidityUsd > 0) {
    risk += 10;
    reasons.push('Volume is high relative to liquidity');
  }

  if (txns24h < 20) {
    risk += 10;
    reasons.push('Low transaction count');
  }

  risk = Math.max(0, Math.min(100, Math.round(risk)));
  const label = risk >= 75 ? 'high' : risk >= 45 ? 'medium' : 'low';
  return { risk, label, reasons };
}

export function pickSolanaPair(pairs = []) {
  return pairs
    .filter(pair => String(pair.chainId).toLowerCase() === 'solana')
    .sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0))[0] || null;
}

router.get('/token-risk', (req, res) => {
  const protocol = req.protocol || 'https';
  const host = req.get('host') || 'www.meterflow.fun';
  const publicUrl = `${protocol}://${host}${req.originalUrl || '/mcp/token-risk'}`;

  res.json({
    id: 'mtr_mcp_token_risk',
    name: 'Meterflow Token Risk MCP Tool',
    status: 'live',
    method: 'POST',
    endpoint: publicUrl,
    payment: {
      rail: 'x402',
      asset: 'USDC',
      priceUsd: 0.006,
    },
    input: {
      contentType: 'application/json',
      schema: {
        address: 'Solana token mint address',
      },
      example: {
        address: 'So11111111111111111111111111111111111111112',
      },
    },
    message: 'Send a POST request with a Solana token address to receive the x402 payment challenge and run the paid risk lookup.',
  });
});

router.post('/token-risk', authenticateApiKey, async (req, res) => {
  const startedAt = Date.now();
  const address = String(req.body?.address || req.body?.mint || '').trim();

  if (!SOLANA_ADDRESS_RE.test(address)) {
    return res.status(400).json({
      error: 'invalid_token_address',
      message: 'address or mint must be a valid Solana token address.',
    });
  }

  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      throw new Error(`DexScreener ${response.status}`);
    }

    const data = await response.json();
    const pair = pickSolanaPair(data.pairs || []);

    if (!pair) {
      await completeMeteredRequest(req, {
        status: 'not_found',
        responseStatus: 404,
        latencyMs: Date.now() - startedAt,
      });
      return res.status(404).json({
        error: 'token_not_found',
        message: 'No Solana market data found for this token.',
      });
    }

    const risk = scoreRisk(pair);
    await completeMeteredRequest(req, {
      status: 'metered_key',
      responseStatus: 200,
      latencyMs: Date.now() - startedAt,
    });

    res.json({
      token: {
        address,
        chainId: pair.chainId,
        dexId: pair.dexId,
        pairAddress: pair.pairAddress,
        baseToken: pair.baseToken,
        quoteToken: pair.quoteToken,
      },
      market: {
        priceUsd: pair.priceUsd ? Number(pair.priceUsd) : null,
        liquidityUsd: Number(pair?.liquidity?.usd || 0),
        fdv: Number(pair?.fdv || 0),
        volume24h: Number(pair?.volume?.h24 || 0),
        txns24h: Number(pair?.txns?.h24?.buys || 0) + Number(pair?.txns?.h24?.sells || 0),
        pairCreatedAt: pair.pairCreatedAt || null,
        url: pair.url || null,
      },
      risk,
      receiptHint: 'Fetch /v1/receipts to inspect the Meterflow receipt for this call.',
    });
  } catch (err) {
    await completeMeteredRequest(req, {
      status: 'upstream_error',
      responseStatus: 502,
      latencyMs: Date.now() - startedAt,
      error: err.message,
    }).catch(() => {});
    logger.error('MCP token risk failed', { err: err.message, address });
    res.status(502).json({
      error: 'token_risk_failed',
      message: 'Token risk lookup failed. Try again.',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

export default router;
