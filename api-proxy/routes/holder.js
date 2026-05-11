import crypto from 'crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { CONFIG } from '../config.js';
import { SOLANA_ADDRESS_RE } from './mcp.js';
import { logger } from '../lib/logger.js';

const router = Router();

const deepDiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many public wallet investigations. Try again later.' },
});

function heliusRpcUrl() {
  if (CONFIG.HELIUS_RPC_URL) return CONFIG.HELIUS_RPC_URL;
  if (CONFIG.HELIUS_API_KEY) return `https://mainnet.helius-rpc.com/?api-key=${CONFIG.HELIUS_API_KEY}`;
  return 'https://api.mainnet-beta.solana.com';
}

async function rpc(method, params = [], timeoutMs = 8_000) {
  const response = await fetch(heliusRpcUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${method} HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || `${method} failed`);
  return data.result;
}

async function getEnhancedTransactions(address) {
  if (!CONFIG.HELIUS_API_KEY) return [];
  const url = new URL(`https://api.helius.xyz/v0/addresses/${address}/transactions`);
  url.searchParams.set('api-key', CONFIG.HELIUS_API_KEY);
  url.searchParams.set('limit', '20');
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Enhanced transactions HTTP ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

function fakeReceipt(step, index, latencyMs) {
  const hash = crypto.createHash('sha1').update(`${step.id}:${Date.now()}:${index}`).digest('hex').slice(0, 10);
  return {
    id: `rcpt_demo_${hash}`,
    amountUsd: step.priceUsd,
    asset: 'USDC',
    status: 'simulated_paid',
    latencyMs,
    txSignature: `${hash.slice(0, 3)}...${hash.slice(-4)}`,
  };
}

async function pricedStep(step, fn, index) {
  const started = Date.now();
  try {
    const data = await fn();
    const latencyMs = Date.now() - started;
    return {
      ...step,
      status: 'success',
      latencyMs,
      receipt: fakeReceipt(step, index, latencyMs),
      data,
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    return {
      ...step,
      status: 'degraded',
      latencyMs,
      receipt: fakeReceipt(step, index, latencyMs),
      error: err.message,
      data: null,
    };
  }
}

function summarizeAssets(assetResult) {
  const items = assetResult?.items || [];
  const nativeBalance = assetResult?.nativeBalance?.lamports
    ? Number(assetResult.nativeBalance.lamports) / 1_000_000_000
    : null;
  const fungibles = items.filter(item => String(item.interface || '').toLowerCase().includes('fungible'));
  const nfts = items.filter(item => !String(item.interface || '').toLowerCase().includes('fungible'));
  const compressed = items.filter(item => item.compression?.compressed);
  const topAssets = items.slice(0, 8).map(item => ({
    name: item.content?.metadata?.name || item.token_info?.symbol || item.id,
    symbol: item.token_info?.symbol || null,
    interface: item.interface || null,
    compressed: !!item.compression?.compressed,
  }));
  return {
    totalAssets: Number(assetResult?.total || items.length || 0),
    sampledAssets: items.length,
    nativeSol: nativeBalance,
    fungibleCount: fungibles.length,
    nftCount: nfts.length,
    compressedCount: compressed.length,
    topAssets,
  };
}

function summarizeTransactions(signatures = [], enhanced = []) {
  const now = Date.now() / 1000;
  const blockTimes = signatures.map(tx => tx.blockTime).filter(Boolean);
  const newest = Math.max(...blockTimes, 0) || null;
  const oldest = Math.min(...blockTimes, Number.POSITIVE_INFINITY);
  const types = enhanced.reduce((acc, tx) => {
    const type = tx.type || 'UNKNOWN';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  const feeTotalSol = enhanced.reduce((sum, tx) => sum + Number(tx.fee || 0), 0) / 1_000_000_000;
  return {
    sampledTransactions: signatures.length,
    enhancedSample: enhanced.length,
    newestAt: newest ? new Date(newest * 1000).toISOString() : null,
    oldestSampleAt: Number.isFinite(oldest) ? new Date(oldest * 1000).toISOString() : null,
    inactiveDays: newest ? Math.max(0, Math.round((now - newest) / 86_400)) : null,
    typeBreakdown: types,
    estimatedFeesSol: Number(feeTotalSol.toFixed(6)),
    recentSignatures: signatures.slice(0, 5).map(tx => ({
      signature: tx.signature,
      slot: tx.slot,
      blockTime: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null,
    })),
  };
}

function buildVerdict(address, portfolio, activity) {
  const findings = [];
  let score = 45;

  if (portfolio.nativeSol !== null) {
    if (portfolio.nativeSol >= 10) {
      score += 10;
      findings.push(`SOL balance is meaningful at ${portfolio.nativeSol.toFixed(2)} SOL.`);
    } else if (portfolio.nativeSol < 0.05) {
      score -= 8;
      findings.push('SOL balance is very low, which limits transaction readiness.');
    }
  }

  if (portfolio.fungibleCount >= 6) {
    score += 10;
    findings.push('Wallet holds a diverse set of fungible assets.');
  }
  if (portfolio.nftCount >= 10) {
    score += 8;
    findings.push('NFT footprint suggests collector or app activity.');
  }
  if (activity.sampledTransactions >= 20) {
    score += 12;
    findings.push('Recent transaction sample shows consistent activity.');
  } else if (activity.sampledTransactions < 3) {
    score -= 10;
    findings.push('Very little recent transaction history was found.');
  }
  if (activity.inactiveDays !== null && activity.inactiveDays > 30) {
    score -= 12;
    findings.push(`Wallet appears inactive for about ${activity.inactiveDays} days.`);
  }

  const types = Object.keys(activity.typeBreakdown || {});
  if (types.some(type => ['SWAP', 'TOKEN_SWAP'].includes(type))) findings.push('Recent history includes swap activity.');
  if (types.some(type => type.includes('NFT'))) findings.push('Recent history includes NFT activity.');

  score = Math.max(0, Math.min(100, Math.round(score)));
  const risk = score >= 70 ? 'strong' : score >= 45 ? 'mixed' : 'thin';
  const persona = portfolio.nftCount > portfolio.fungibleCount * 2
    ? 'Collector wallet'
    : types.some(type => ['SWAP', 'TOKEN_SWAP'].includes(type))
      ? 'Active trading wallet'
      : activity.sampledTransactions > 10
        ? 'Active Solana wallet'
        : 'Thin or dormant wallet';

  return {
    address,
    score,
    risk,
    persona,
    headline: `${persona} with ${risk} signal quality`,
    findings: findings.slice(0, 6),
    nextAction: risk === 'strong'
      ? 'Good candidate for deeper counterparty and flow tracing.'
      : 'Use a larger transaction window before trusting this wallet as a signal source.',
  };
}

router.post('/wallet-deep-dive', deepDiveLimiter, async (req, res) => {
  const address = String(req.body?.address || '').trim();

  if (!SOLANA_ADDRESS_RE.test(address)) {
    return res.status(400).json({
      error: 'invalid_wallet_address',
      message: 'address must be a valid Solana wallet address.',
    });
  }

  const steps = await Promise.all([
    pricedStep(
      { id: 'wallet_balance', label: 'Check SOL balance', route: 'Helius RPC getBalance', priceUsd: 0.003 },
      () => rpc('getBalance', [address]),
      0,
    ),
    pricedStep(
      { id: 'asset_inventory', label: 'Inventory tokens and NFTs', route: 'Helius DAS getAssetsByOwner', priceUsd: 0.008 },
      () => rpc('getAssetsByOwner', {
        ownerAddress: address,
        page: 1,
        limit: 100,
        displayOptions: { showFungible: true },
      }),
      1,
    ),
    pricedStep(
      { id: 'recent_activity', label: 'Read recent transaction history', route: 'Helius RPC getSignaturesForAddress', priceUsd: 0.006 },
      () => rpc('getSignaturesForAddress', [address, { limit: 30 }]),
      2,
    ),
    pricedStep(
      { id: 'behavior_parse', label: 'Classify wallet behavior', route: 'Helius Enhanced Transactions', priceUsd: 0.012 },
      () => getEnhancedTransactions(address),
      3,
    ),
  ]);

  const balanceLamports = steps.find(step => step.id === 'wallet_balance')?.data?.value;
  const assetSummary = summarizeAssets(steps.find(step => step.id === 'asset_inventory')?.data);
  if (Number.isFinite(balanceLamports) && assetSummary.nativeSol === null) {
    assetSummary.nativeSol = Number(balanceLamports) / 1_000_000_000;
  }
  const activitySummary = summarizeTransactions(
    steps.find(step => step.id === 'recent_activity')?.data || [],
    steps.find(step => step.id === 'behavior_parse')?.data || [],
  );
  const verdict = buildVerdict(address, assetSummary, activitySummary);
  const spentUsd = steps.reduce((sum, step) => sum + Number(step.priceUsd || 0), 0);

  res.setHeader('Cache-Control', 'public, max-age=20');
  res.json({
    demoMode: true,
    checkout: {
      budgetUsd: 0.05,
      spentUsd: Number(spentUsd.toFixed(3)),
      remainingUsd: Number((0.05 - spentUsd).toFixed(3)),
      asset: 'USDC',
      note: 'Payments and receipts are simulated for this public demo; the Helius reads are real server-side calls.',
    },
    steps: steps.map(({ data, ...step }) => step),
    report: {
      wallet: address,
      portfolio: assetSummary,
      activity: activitySummary,
      verdict,
      explorer: `https://orbmarkets.io/address/${address}`,
    },
  });
});

export default router;
