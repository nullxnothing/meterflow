import { listMeters, listReceipts, getReceipt } from './control-plane.js';

function maskWallet(wallet = '') {
  const value = String(wallet || '');
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function publicStatus(status) {
  if (['live', 'example', 'test'].includes(status)) return status;
  return 'unlisted';
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function summarizeReceipts(receipts = []) {
  const totalCalls = receipts.length;
  const paidCalls = receipts.filter(receipt => ['verified', 'metered_key'].includes(receipt.status)).length;
  const failedCalls = receipts.filter(receipt => !['verified', 'metered_key'].includes(receipt.status)).length;
  const verifiedRevenueUsd = receipts
    .filter(receipt => receipt.status === 'verified')
    .reduce((sum, receipt) => sum + safeNumber(receipt.baseAmountUsd ?? receipt.amountUsd), 0);
  const estimatedGrossUsd = receipts
    .filter(receipt => ['verified', 'metered_key'].includes(receipt.status))
    .reduce((sum, receipt) => sum + safeNumber(receipt.baseAmountUsd ?? receipt.amountUsd), 0);
  const latencyValues = receipts
    .map(receipt => optionalNumber(receipt.latencyMs))
    .filter(value => Number.isFinite(value) && value >= 0);

  return {
    totalCalls,
    paidCalls,
    failedCalls,
    successRate: totalCalls ? Number((paidCalls / totalCalls).toFixed(4)) : null,
    verifiedRevenueUsd: Number(verifiedRevenueUsd.toFixed(6)),
    estimatedGrossUsd: Number(estimatedGrossUsd.toFixed(6)),
    avgLatencyMs: latencyValues.length
      ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length)
      : null,
    p95LatencyMs: percentile(latencyValues, 95),
  };
}

function inferCategory(route = '') {
  if (route.includes('/mcp/')) return 'mcp-tool';
  if (route.includes('/alpha')) return 'data';
  if (route.includes('/trading')) return 'trading';
  if (route.includes('/image') || route.includes('/video')) return 'media';
  if (route.includes('/chat') || route.includes('/multi')) return 'model';
  return 'api';
}

function publicMeter(meter, summary) {
  return {
    id: meter.id,
    route: meter.route,
    method: meter.method || 'GET',
    unit: meter.unit || 'request',
    priceUsd: safeNumber(meter.priceUsd),
    asset: meter.asset || 'USDC',
    status: publicStatus(meter.status),
    mode: meter.mode || meter.status || 'test',
    category: meter.category || inferCategory(meter.route),
    provider: {
      wallet: maskWallet(meter.ownerWallet),
      verified: meter.source === 'default' || Boolean(meter.providerVerified),
      source: meter.source || 'custom',
    },
    stats: summary,
    sampleCurl: `curl -i https://meterflow.fun/proxy${meter.route}`,
  };
}

export async function listPublicRegistry(filters = {}) {
  const meters = await listMeters();
  const publicMeters = meters.filter(meter => ['live', 'example', 'test'].includes(meter.status));
  const receipts = await listReceipts({ limit: 500 });

  return publicMeters
    .filter(meter => !filters.category || (meter.category || inferCategory(meter.route)) === filters.category)
    .filter(meter => !filters.status || meter.status === filters.status)
    .map(meter => {
      const meterReceipts = receipts.filter(receipt => receipt.meterId === meter.id || receipt.route === meter.route);
      return publicMeter(meter, summarizeReceipts(meterReceipts));
    })
    .sort((a, b) => {
      const statusScore = status => (status === 'live' ? 3 : status === 'example' ? 2 : 1);
      return statusScore(b.status) - statusScore(a.status)
        || b.stats.totalCalls - a.stats.totalCalls
        || a.priceUsd - b.priceUsd;
    });
}

export async function getPublicRegistryItem(meterId) {
  const registry = await listPublicRegistry();
  return registry.find(item => item.id === meterId) || null;
}

export async function findPublicReceipt({ receiptId, txSignature }) {
  let receipt = null;
  if (receiptId) {
    receipt = await getReceipt(receiptId);
  }
  if (!receipt && txSignature) {
    const receipts = await listReceipts({ txSignature, limit: 1 });
    receipt = receipts[0] || null;
  }
  if (!receipt) return null;

  return {
    id: receipt.id,
    createdAt: receipt.createdAt,
    route: receipt.route,
    method: receipt.method,
    status: receipt.status,
    amountUsd: safeNumber(receipt.amountUsd),
    baseAmountUsd: safeNumber(receipt.baseAmountUsd ?? receipt.amountUsd),
    protocolFeeUsd: safeNumber(receipt.protocolFeeUsd),
    protocolFeeBps: safeNumber(receipt.protocolFeeBps),
    asset: receipt.asset || 'USDC',
    paymentState: receipt.paymentState,
    paymentNetwork: receipt.paymentNetwork,
    paymentMint: receipt.paymentMint,
    payerWallet: maskWallet(receipt.payerWallet),
    payTo: maskWallet(receipt.payTo),
    txSignature: receipt.txSignature || null,
    quoteId: receipt.quoteId || null,
    policyResult: receipt.policyResult,
    responseStatus: receipt.responseStatus,
    latencyMs: optionalNumber(receipt.latencyMs),
  };
}
