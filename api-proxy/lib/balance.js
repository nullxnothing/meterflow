import { CONFIG, TOKEN_GATING_ENABLED } from '../config.js';
import { balanceCache, treasuryBalanceCache, TREASURY_CACHE_TTL } from '../state.js';
import { logger } from './logger.js';
import { fetchWithRetry } from './retry.js';

const FETCH_TIMEOUT = 10_000;

async function fetchBalanceFromRPC(walletAddress) {
  const response = await fetchWithRetry(
    () => fetch(`https://mainnet.helius-rpc.com/?api-key=${CONFIG.HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'infinite-balance-check',
        method: 'getTokenAccountsByOwner',
        params: [walletAddress, { mint: CONFIG.TOKEN_MINT }, { encoding: 'jsonParsed' }],
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    }),
    'Helius RPC'
  );

  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'RPC error');

  if (data.result?.value?.length > 0) {
    return data.result.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
  }
  return 0;
}

async function getTokenBalance(walletAddress) {
  if (!TOKEN_GATING_ENABLED) return 0;

  const cached = balanceCache.get(walletAddress);
  if (cached && Date.now() - cached.checkedAt < CONFIG.BALANCE_CACHE_TTL) {
    return cached.balance;
  }

  try {
    const balance = await fetchBalanceFromRPC(walletAddress);
    balanceCache.set(walletAddress, { balance, checkedAt: Date.now() });
    return balance;
  } catch (err) {
    logger.error('Balance check failed after retries', { wallet: walletAddress.slice(0, 8), err: err.message });
  }

  // Retries exhausted — use stale cache if available
  if (cached) {
    logger.warn('Using stale balance cache', { wallet: walletAddress.slice(0, 8), ageSec: Math.round((Date.now() - cached.checkedAt) / 1000) });
    return cached.balance;
  }

  logger.error('No balance cache available, returning 0', { wallet: walletAddress.slice(0, 8) });
  return 0;
}

async function getTreasuryBalance() {
  if (!CONFIG.TREASURY_WALLET || !CONFIG.HELIUS_API_KEY) {
    return treasuryBalanceCache;
  }

  if (Date.now() - treasuryBalanceCache.checkedAt < TREASURY_CACHE_TTL) {
    return treasuryBalanceCache;
  }

  try {
    const [balanceRes, priceRes] = await Promise.allSettled([
      fetch(`https://mainnet.helius-rpc.com/?api-key=${CONFIG.HELIUS_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 'treasury-balance',
          method: 'getBalance',
          params: [CONFIG.TREASURY_WALLET]
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      }).then(r => r.json()),
      fetch('https://api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112', {
        headers: CONFIG.JUPITER_API_KEY ? { 'x-api-key': CONFIG.JUPITER_API_KEY } : {},
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      }).then(r => r.json()),
    ]);

    if (balanceRes.status === 'fulfilled' && balanceRes.value.result?.value !== undefined) {
      const lamports = balanceRes.value.result.value;
      treasuryBalanceCache.sol = lamports / 1_000_000_000;
    }

    if (priceRes.status === 'fulfilled') {
      const solData = priceRes.value?.['So11111111111111111111111111111111111111112'];
      const price = parseFloat(solData?.usdPrice ?? solData?.price ?? 0);
      if (price > 0) treasuryBalanceCache.solPrice = price;
    }

    treasuryBalanceCache.usd = treasuryBalanceCache.sol * treasuryBalanceCache.solPrice;
    treasuryBalanceCache.checkedAt = Date.now();
  } catch (err) {
    logger.error('Treasury balance check failed', { err: err.message });
  }

  return treasuryBalanceCache;
}

export { getTokenBalance, getTreasuryBalance };
