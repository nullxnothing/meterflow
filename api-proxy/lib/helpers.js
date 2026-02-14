import crypto from 'crypto';
import { CONFIG, TOKEN_GATING_ENABLED } from '../config.js';
import { getUsage as getUsageFromKV, incrementUsage as incrementUsageKV } from './kv-usage.js';

function generateApiKey() {
  const random = crypto.randomBytes(24).toString('hex');
  return `inf_${random}`;
}

function getTierForBalance(balance) {
  if (!TOKEN_GATING_ENABLED) return 'operator';
  if (balance >= CONFIG.TIERS.architect.min) return 'architect';
  if (balance >= CONFIG.TIERS.operator.min) return 'operator';
  if (balance >= CONFIG.TIERS.signal.min) return 'signal';
  return null;
}

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

// Get usage (now persisted to Redis)
async function getUsage(apiKey) {
  return getUsageFromKV(apiKey);
}

// Increment usage (now persisted to Redis)
async function incrementUsage(apiKey, tokens = 0) {
  return incrementUsageKV(apiKey, tokens);
}

async function fetchTokenInfo(address) {
  const info = { address, name: null, symbol: null, price: null, marketCap: null, liquidity: null, change24h: null };

  const [assetResult, priceResult, dexResult] = await Promise.allSettled([
    fetch(`https://mainnet.helius-rpc.com/?api-key=${CONFIG.HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'token-info', method: 'getAsset', params: { id: address } })
    }).then(r => r.json()),
    fetch(`https://api.jup.ag/price/v2?ids=${address}`).then(r => r.json()),
    fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`).then(r => r.json()),
  ]);

  if (assetResult.status === 'fulfilled' && assetResult.value.result) {
    const asset = assetResult.value.result;
    info.name = asset.content?.metadata?.name || null;
    info.symbol = asset.content?.metadata?.symbol || null;
  }

  if (priceResult.status === 'fulfilled' && priceResult.value.data?.[address]) {
    info.price = parseFloat(priceResult.value.data[address].price) || null;
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

export { generateApiKey, getTierForBalance, getTodayKey, getUsage, incrementUsage, fetchTokenInfo };
