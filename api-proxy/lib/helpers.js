import crypto from 'crypto';
import { CONFIG, TOKEN_GATING_ENABLED, FREE_ACCESS_TIER, isFreeAccessActive } from '../config.js';
import { getUsage, incrementUsage as incrementUsageKV, incrementGlobalStats, incrementModelStats, getModelAnalytics } from './kv-usage.js';

function generateApiKey() {
  const random = crypto.randomBytes(24).toString('hex');
  return `inf_${random}`;
}

function getTierForBalance(balance) {
  if (!TOKEN_GATING_ENABLED) return 'operator';
  if (balance >= CONFIG.TIERS.alpha.min) return 'alpha';
  if (balance >= CONFIG.TIERS.architect.min) return 'architect';
  if (balance >= CONFIG.TIERS.operator.min) return 'operator';
  if (balance >= CONFIG.TIERS.signal.min) return 'signal';
  if (isFreeAccessActive()) return FREE_ACCESS_TIER;
  return null;
}

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

async function incrementUsage(apiKey, tokens = 0) {
  const [result] = await Promise.all([
    incrementUsageKV(apiKey, tokens),
    incrementGlobalStats(tokens),
  ]);
  return result;
}

async function fetchTokenInfo(address) {
  const info = { address, name: null, symbol: null, price: null, marketCap: null, liquidity: null, change24h: null };

  const [assetResult, priceResult, dexResult] = await Promise.allSettled([
    fetch(`https://mainnet.helius-rpc.com/?api-key=${CONFIG.HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'token-info', method: 'getAsset', params: { id: address } })
    }).then(r => r.json()),
    fetch(`https://api.jup.ag/price/v3?ids=${address}`, {
      headers: CONFIG.JUPITER_API_KEY ? { 'x-api-key': CONFIG.JUPITER_API_KEY } : {},
    }).then(r => r.json()),
    fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`).then(r => r.json()),
  ]);

  if (assetResult.status === 'fulfilled' && assetResult.value.result) {
    const asset = assetResult.value.result;
    info.name = asset.content?.metadata?.name || null;
    info.symbol = asset.content?.metadata?.symbol || null;
  }

  if (priceResult.status === 'fulfilled') {
    const tokenData = priceResult.value?.[address] || priceResult.value?.data?.[address];
    if (tokenData) info.price = parseFloat(tokenData.usdPrice ?? tokenData.price ?? 0) || null;
  }

  if (dexResult.status === 'fulfilled' && dexResult.value.pairs?.length > 0) {
    const pair = dexResult.value.pairs[0];
    info.marketCap = pair.marketCap || null;
    info.liquidity = pair.liquidity?.usd || null;
    info.change24h = pair.priceChange?.h24 || null;
    if (!info.price && pair.priceUsd) info.price = parseFloat(pair.priceUsd);
    if (!info.name && pair.baseToken?.name) info.name = pair.baseToken.name;
    if (!info.symbol && pair.baseToken?.symbol) info.symbol = pair.baseToken.symbol;
  }

  return info;
}

export { generateApiKey, getTierForBalance, getTodayKey, getUsage, incrementUsage, incrementModelStats, getModelAnalytics, fetchTokenInfo };

