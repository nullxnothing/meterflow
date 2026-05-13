import { CONFIG, TOKEN_GATING_ENABLED } from '../config.js';
import { balanceCache, treasuryBalanceCache, TREASURY_CACHE_TTL } from '../state.js';
import { logger } from './logger.js';
import { fetchWithRetry } from './retry.js';

const FETCH_TIMEOUT = 10_000;
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const TOKEN_PROGRAM_IDS = [
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
];

function getRpcUrl() {
  const rpcUrl = CONFIG.HELIUS_RPC_URL?.trim();
  const apiKey = CONFIG.HELIUS_API_KEY?.trim();
  if (rpcUrl) return rpcUrl;
  if (apiKey) return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  return 'https://api.mainnet-beta.solana.com';
}

function tokenAccountAmount(account) {
  const tokenAmount = account?.account?.data?.parsed?.info?.tokenAmount;
  const amount = tokenAmount?.uiAmountString ?? tokenAmount?.uiAmount ?? 0;
  const parsed = Number(amount);
  return Number.isFinite(parsed) ? parsed : 0;
}

function tokenAccountMint(account) {
  return account?.account?.data?.parsed?.info?.mint || null;
}

function sumTokenAccounts(accounts = []) {
  return accounts.reduce((sum, account) => sum + tokenAccountAmount(account), 0);
}

async function fetchTokenAccounts(walletAddress, filter, id) {
  const response = await fetchWithRetry(
    () => fetch(getRpcUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'getTokenAccountsByOwner',
        params: [walletAddress, filter, { encoding: 'jsonParsed' }],
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    }),
    'Helius RPC'
  );

  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'RPC error');
  return Array.isArray(data.result?.value) ? data.result.value : [];
}

async function fetchBalanceFromRPC(walletAddress) {
  let primaryError = null;
  try {
    const accounts = await fetchTokenAccounts(
      walletAddress,
      { mint: CONFIG.TOKEN_MINT },
      'meterflow-balance-check'
    );
    if (accounts.length > 0) return sumTokenAccounts(accounts);
  } catch (err) {
    primaryError = err;
    logger.warn('Mint balance lookup failed, trying token program fallback', { wallet: walletAddress.slice(0, 8), err: err.message });
  }

  const fallbackResults = await Promise.allSettled(
    TOKEN_PROGRAM_IDS.map(programId =>
      fetchTokenAccounts(walletAddress, { programId }, `meterflow-balance-check-${programId.slice(0, 6)}`)
    )
  );
  const fallbackAccounts = fallbackResults
    .filter(result => result.status === 'fulfilled')
    .flatMap(result => result.value)
    .filter(account => tokenAccountMint(account) === CONFIG.TOKEN_MINT);
  if (fallbackAccounts.length > 0) return sumTokenAccounts(fallbackAccounts);
  if (primaryError && fallbackResults.every(result => result.status === 'rejected')) throw primaryError;
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
  if (!CONFIG.TREASURY_WALLET) {
    return treasuryBalanceCache;
  }

  if (Date.now() - treasuryBalanceCache.checkedAt < TREASURY_CACHE_TTL) {
    return treasuryBalanceCache;
  }

  try {
    const [balanceRes, usdcRes, priceRes] = await Promise.allSettled([
      fetch(getRpcUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 'treasury-balance',
          method: 'getBalance',
          params: [CONFIG.TREASURY_WALLET]
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      }).then(r => r.json()),
      fetch(getRpcUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 'treasury-usdc-balance',
          method: 'getTokenAccountsByOwner',
          params: [CONFIG.TREASURY_WALLET, { mint: USDC_MINT }, { encoding: 'jsonParsed' }]
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

    if (usdcRes.status === 'fulfilled' && Array.isArray(usdcRes.value.result?.value)) {
      treasuryBalanceCache.usdc = usdcRes.value.result.value.reduce((sum, account) => {
        const amount = account.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
        return sum + Number(amount || 0);
      }, 0);
    }

    if (priceRes.status === 'fulfilled') {
      const solData = priceRes.value?.['So11111111111111111111111111111111111111112'];
      const price = parseFloat(solData?.usdPrice ?? solData?.price ?? 0);
      if (price > 0) treasuryBalanceCache.solPrice = price;
    }

    treasuryBalanceCache.usd = treasuryBalanceCache.usdc + (treasuryBalanceCache.sol * treasuryBalanceCache.solPrice);
    treasuryBalanceCache.checkedAt = Date.now();
  } catch (err) {
    logger.error('Treasury balance check failed', { err: err.message });
  }

  return treasuryBalanceCache;
}

export { getTokenBalance, getTreasuryBalance };
