import { CONFIG, TOKEN_GATING_ENABLED } from '../config.js';
import { balanceCache, treasuryBalanceCache, TREASURY_CACHE_TTL } from '../state.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 300;

async function fetchBalanceFromRPC(walletAddress) {
  const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${CONFIG.HELIUS_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'infinite-balance-check',
      method: 'getTokenAccountsByOwner',
      params: [
        walletAddress,
        { mint: CONFIG.TOKEN_MINT },
        { encoding: 'jsonParsed' }
      ]
    })
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'RPC error');
  }

  let balance = 0;
  if (data.result?.value?.length > 0) {
    balance = data.result.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
  }
  return balance;
}

async function getTokenBalance(walletAddress) {
  if (!TOKEN_GATING_ENABLED) return 0;

  const cached = balanceCache.get(walletAddress);
  if (cached && Date.now() - cached.checkedAt < CONFIG.BALANCE_CACHE_TTL) {
    return cached.balance;
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const balance = await fetchBalanceFromRPC(walletAddress);
      balanceCache.set(walletAddress, { balance, checkedAt: Date.now() });
      return balance;
    } catch (err) {
      console.error(`[Balance] Attempt ${attempt + 1}/${MAX_RETRIES} failed for ${walletAddress.slice(0, 8)}...: ${err.message}`);
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt)));
      }
    }
  }

  // All retries exhausted — use stale cache if available
  if (cached) {
    console.warn(`[Balance] Using stale cache for ${walletAddress.slice(0, 8)}... (age: ${Math.round((Date.now() - cached.checkedAt) / 1000)}s)`);
    return cached.balance;
  }

  console.error(`[Balance] No cache available for ${walletAddress.slice(0, 8)}..., returning 0`);
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
        })
      }).then(r => r.json()),
      fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112')
        .then(r => r.json()),
    ]);

    if (balanceRes.status === 'fulfilled' && balanceRes.value.result?.value !== undefined) {
      const lamports = balanceRes.value.result.value;
      treasuryBalanceCache.sol = lamports / 1_000_000_000;
    }

    if (priceRes.status === 'fulfilled') {
      const price = parseFloat(priceRes.value?.data?.['So11111111111111111111111111111111111111112']?.price);
      if (price > 0) treasuryBalanceCache.solPrice = price;
    }

    treasuryBalanceCache.usd = treasuryBalanceCache.sol * treasuryBalanceCache.solPrice;
    treasuryBalanceCache.checkedAt = Date.now();
  } catch (err) {
    console.error('[Treasury] Balance check failed:', err.message);
  }

  return treasuryBalanceCache;
}

export { getTokenBalance, getTreasuryBalance };
