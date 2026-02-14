// In-memory store (swap for Redis in production)
const apiKeys = new Map();      // apiKey -> { wallet, tier, createdAt }
const walletKeys = new Map();   // wallet -> apiKey
const usageCounts = new Map();  // apiKey -> { date, count, tokens }
const balanceCache = new Map(); // wallet -> { balance, checkedAt }
const videoOperations = new Map(); // operationName -> { apiKey, prompt, status, result }

// Trading bot state
const tradingWallets = new Map();    // apiKey → { encryptedKeypair, publicKey, createdAt }
const tradingPositions = new Map();  // apiKey → Map<mint, { amount, avgPrice, entryTime }>
const tradeHistory = new Map();      // apiKey → [{ id, action, mint, sol, tokens, sig, ts }]
const activeDCA = new Map();         // orderId → { apiKey, order }
const activeCopyTraders = new Map(); // apiKey → CopyTrader instance
const activeTriggers = new Map();    // apiKey → TriggerManager instance
const safetyManagers = new Map();    // apiKey → SafetyManager instance

// Voting state (now stored in Upstash Redis — see lib/kv-votes.js)
// In-memory fallback still available if Redis not configured
const VALID_API_IDS = new Set([
  'helius', 'quicknode', 'alchemy', 'triton', 'jupiter', 'raydium', 'orca',
  'pumpfun', 'birdeye', 'dexscreener', 'defillama', 'coingecko', 'magiceden',
  'tensor', 'metaplex', 'twitter', 'telegram', 'discord', 'shyft', 'hellomoon',
]);

// Treasury state (mutable — use getter/setter since ES module re-exports are live bindings for const, not let)
let _treasuryState = {
  multiplier: 1.0,
  healthStatus: 'unknown',
  runwayDays: 0,
  dailyBudget: 0,
  treasuryBalanceUsd: 0,
  updatedAt: null,
};

function getTreasuryState() { return _treasuryState; }
function setTreasuryState(state) { _treasuryState = state; }

const treasuryBalanceCache = { sol: 0, usd: 0, solPrice: 0, checkedAt: 0 };
const TREASURY_CACHE_TTL = 5 * 60 * 1000;

export {
  apiKeys, walletKeys, usageCounts, balanceCache, videoOperations,
  tradingWallets, tradingPositions, tradeHistory, activeDCA, activeCopyTraders, activeTriggers, safetyManagers,
  VALID_API_IDS,
  getTreasuryState, setTreasuryState,
  treasuryBalanceCache, TREASURY_CACHE_TTL,
};
