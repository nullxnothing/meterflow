import { PublicKey } from '@solana/web3.js';
import { CONFIG, solanaConnection } from '../config.js';
import { logger } from './logger.js';

const TOKEN_CACHE_TTL = 45_000;
const HOLDER_CACHE_TTL = 120_000;

let summaryCache = { ts: 0, data: null };
let holdersCache = { ts: 0, data: null };
let marketCache = { ts: 0, data: null };

function configuredMint() {
  const mint = String(CONFIG.TOKEN_MINT || '').trim();
  return mint && mint !== 'PASTE_YOUR_TOKEN_MINT_HERE' ? mint : '';
}

function tokenConfig() {
  const mint = configuredMint();
  const buyUrl = mint ? `${CONFIG.PUBLIC_URL}/buy?input=SOL` : null;
  return {
    configured: !!mint,
    mint: mint || null,
    name: CONFIG.TOKEN_NAME || 'Meterflow',
    symbol: CONFIG.TOKEN_SYMBOL || 'MFLOW',
    swapUrl: CONFIG.TOKEN_SWAP_URL || buyUrl,
    orbUrl: mint ? `https://orbmarkets.io/token/${mint}` : null,
    dexscreenerUrl: mint ? `https://dexscreener.com/solana/${mint}` : null,
  };
}

function assertConfiguredMint() {
  const cfg = tokenConfig();
  if (!cfg.configured) {
    const err = new Error('METERFLOW_TOKEN_CA is not configured');
    err.code = 'token_not_configured';
    throw err;
  }
  return cfg.mint;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function heliusRpc(method, params) {
  const rpcUrl = CONFIG.HELIUS_RPC_URL || (CONFIG.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${CONFIG.HELIUS_API_KEY}` : '');
  if (!rpcUrl) return null;
  const data = await fetchJson(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: `meterflow-${method}`, method, params }),
  });
  if (data.error) throw new Error(data.error.message || `${method} failed`);
  return data.result || null;
}

function normalizeAsset(asset, fallback) {
  const metadata = asset?.content?.metadata || {};
  const tokenInfo = asset?.token_info || {};
  const links = asset?.content?.links || {};
  return {
    name: metadata.name || tokenInfo.name || fallback.name,
    symbol: metadata.symbol || tokenInfo.symbol || fallback.symbol,
    description: metadata.description || null,
    image: links.image || tokenInfo.image || null,
    decimals: numberOrNull(tokenInfo.decimals),
    supply: numberOrNull(tokenInfo.supply),
    raw: {
      interface: asset?.interface || null,
      ownershipModel: asset?.ownership?.ownership_model || null,
      mutable: asset?.mutable ?? null,
      burnt: asset?.burnt ?? null,
    },
  };
}

async function getAssetMetadata(mint) {
  try {
    const asset = await heliusRpc('getAsset', {
      id: mint,
      displayOptions: { showFungible: true },
    });
    return normalizeAsset(asset, tokenConfig());
  } catch (err) {
    logger.warn('token asset lookup failed', { err: err.message, mint });
    return normalizeAsset(null, tokenConfig());
  }
}

async function getTokenSupply(mint) {
  try {
    const supply = await solanaConnection.getTokenSupply(new PublicKey(mint), 'confirmed');
    return {
      amount: supply.value.amount,
      uiAmount: numberOrNull(supply.value.uiAmountString),
      decimals: supply.value.decimals,
    };
  } catch (err) {
    logger.warn('token supply lookup failed', { err: err.message, mint });
    return { amount: null, uiAmount: null, decimals: null };
  }
}

function pickBestPair(pairs, mint) {
  return (pairs || [])
    .filter(pair => String(pair.chainId || '').toLowerCase() === 'solana')
    .filter(pair => pair.baseToken?.address === mint || pair.quoteToken?.address === mint)
    .sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0))[0] || null;
}

function normalizePair(pair, mint) {
  if (!pair) return null;
  const baseIsToken = pair.baseToken?.address === mint;
  const token = baseIsToken ? pair.baseToken : pair.quoteToken;
  return {
    pairAddress: pair.pairAddress || null,
    dexId: pair.dexId || null,
    url: pair.url || null,
    tokenName: token?.name || null,
    tokenSymbol: token?.symbol || null,
    priceUsd: numberOrNull(pair.priceUsd),
    priceNative: numberOrNull(pair.priceNative),
    marketCap: numberOrNull(pair.marketCap),
    fdv: numberOrNull(pair.fdv),
    liquidityUsd: numberOrNull(pair.liquidity?.usd),
    volume24h: numberOrNull(pair.volume?.h24),
    txns24h: {
      buys: numberOrNull(pair.txns?.h24?.buys),
      sells: numberOrNull(pair.txns?.h24?.sells),
    },
    priceChange: {
      m5: numberOrNull(pair.priceChange?.m5),
      h1: numberOrNull(pair.priceChange?.h1),
      h6: numberOrNull(pair.priceChange?.h6),
      h24: numberOrNull(pair.priceChange?.h24),
    },
    createdAt: pair.pairCreatedAt || null,
  };
}

async function getDexMarket(mint) {
  if (marketCache.data && Date.now() - marketCache.ts < TOKEN_CACHE_TTL) return marketCache.data;

  const endpoints = [
    `https://api.dexscreener.com/tokens/v1/solana/${mint}`,
    `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
  ];

  let selected = null;
  let lastError = null;
  for (const url of endpoints) {
    try {
      const data = await fetchJson(url);
      const pairs = Array.isArray(data) ? data : data.pairs;
      selected = pickBestPair(pairs, mint);
      if (selected) break;
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError && !selected) logger.warn('token market lookup failed', { err: lastError.message, mint });
  const data = normalizePair(selected, mint);
  marketCache = { ts: Date.now(), data };
  return data;
}

async function getGeckoChart(mint, pairAddress, dexscreenerPairAddress) {
  const dexEmbedUrl = dexscreenerPairAddress
    ? `https://dexscreener.com/solana/${dexscreenerPairAddress}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=0&chartType=usd&interval=15`
    : null;
  const empty = { poolAddress: null, timeframe: 'hour', candles: [], dexEmbedUrl };
  try {
    let pool = pairAddress || null;
    if (!pool) {
      const pools = await fetchJson(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools?page=1`);
      const first = pools?.data?.[0];
      pool = first?.attributes?.address || String(first?.id || '').replace(/^solana_/, '') || null;
    }
    if (!pool) return empty;

    // Try hourly first, fall back to 5-minute candles for new tokens
    let candles = [];
    for (const [resolution, agg] of [['hour', 1], ['minute', 5]]) {
      const ohlcv = await fetchJson(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/${resolution}?aggregate=${agg}&limit=200`);
      candles = (ohlcv?.data?.attributes?.ohlcv_list || []).map(row => ({
        timestamp: row[0],
        open: numberOrNull(row[1]),
        high: numberOrNull(row[2]),
        low: numberOrNull(row[3]),
        close: numberOrNull(row[4]),
        volume: numberOrNull(row[5]),
      })).reverse().filter(c => Number.isFinite(c.close));
      if (candles.length >= 2) break;
    }

    return { poolAddress: pool, timeframe: candles.length >= 2 ? 'ohlcv' : 'none', candles, dexEmbedUrl };
  } catch (err) {
    logger.warn('token chart lookup failed', { err: err.message, mint });
    return empty;
  }
}

async function getTopHolders(mint) {
  if (holdersCache.data && Date.now() - holdersCache.ts < HOLDER_CACHE_TTL) return holdersCache.data;

  try {
    const largest = await solanaConnection.getTokenLargestAccounts(new PublicKey(mint), 'confirmed');
    const accounts = largest.value || [];
    const parsed = await solanaConnection.getMultipleParsedAccounts(accounts.map(a => a.address), 'confirmed');
    const byOwner = new Map();
    accounts.forEach((account, idx) => {
      const info = parsed.value?.[idx]?.data?.parsed?.info || {};
      const owner = info.owner || account.address.toBase58();
      const current = byOwner.get(owner) || { owner, rawAmount: 0n, uiAmount: 0, accounts: 0 };
      current.rawAmount += BigInt(account.amount || 0);
      current.uiAmount += Number(account.uiAmount || 0);
      current.accounts += 1;
      byOwner.set(owner, current);
    });

    const data = [...byOwner.values()]
      .sort((a, b) => b.uiAmount - a.uiAmount)
      .slice(0, 20)
      .map((h, index) => ({
        rank: index + 1,
        owner: h.owner,
        amount: h.uiAmount,
        rawAmount: h.rawAmount.toString(),
        accounts: h.accounts,
        orbUrl: `https://orbmarkets.io/address/${h.owner}`,
      }));
    holdersCache = { ts: Date.now(), data };
    return data;
  } catch (err) {
    logger.warn('token holder lookup failed', { err: err.message, mint });
    holdersCache = { ts: Date.now(), data: [] };
    return [];
  }
}

async function getHolderCount(mint) {
  try {
    const result = await heliusRpc('getTokenAccounts', { mint, page: 1, limit: 1000 });
    const accounts = result?.token_accounts || result?.tokenAccounts || result?.items || [];
    const total = result?.total || result?.totalTokenAccounts || result?.total_accounts || null;
    return numberOrNull(total) || accounts.filter(a => Number(a.amount || a.balance || a.uiAmount || 0) > 0).length || null;
  } catch (err) {
    logger.warn('token holder count lookup failed', { err: err.message, mint });
    return null;
  }
}

async function getTokenSummary({ refresh = false } = {}) {
  const cfg = tokenConfig();
  if (!cfg.configured) {
    return { configured: false, config: cfg, updatedAt: new Date().toISOString() };
  }
  if (!refresh && summaryCache.data && Date.now() - summaryCache.ts < TOKEN_CACHE_TTL) return summaryCache.data;

  const mint = assertConfiguredMint();
  const [asset, supply, market, holders, holderCount] = await Promise.all([
    getAssetMetadata(mint),
    getTokenSupply(mint),
    getDexMarket(mint),
    getTopHolders(mint),
    getHolderCount(mint),
  ]);
  const chart = await getGeckoChart(mint, market?.pairAddress, market?.pairAddress);
  const circulatingSupply = supply.uiAmount || asset.supply || null;
  const marketCap = market?.marketCap || (market?.priceUsd && circulatingSupply ? market.priceUsd * circulatingSupply : null);
  const holdersWithPct = holders.map(h => ({
    ...h,
    pctSupply: circulatingSupply ? (h.amount / circulatingSupply) * 100 : null,
  }));

  const data = {
    configured: true,
    config: cfg,
    asset: { ...asset, decimals: asset.decimals ?? supply.decimals },
    supply: { ...supply, circulating: circulatingSupply },
    market: market ? { ...market, marketCap } : null,
    chart,
    holderCount,
    holders: holdersWithPct,
    links: {
      orb: cfg.orbUrl,
      dexscreener: market?.url || cfg.dexscreenerUrl,
      swap: cfg.swapUrl || market?.url || cfg.dexscreenerUrl,
    },
    sources: ['Helius DAS/RPC', 'Solana RPC', 'DEX Screener', 'GeckoTerminal'],
    updatedAt: new Date().toISOString(),
  };
  summaryCache = { ts: Date.now(), data };
  return data;
}

export { tokenConfig, getTokenSummary, getTopHolders, getDexMarket };
