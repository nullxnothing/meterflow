// LRU-style bounded cache — evicts oldest entries when full
class BoundedMap extends Map {
  constructor(maxSize = 10_000) {
    super();
    this._maxSize = maxSize;
  }
  set(key, value) {
    if (this.size >= this._maxSize && !this.has(key)) {
      const oldest = this.keys().next().value;
      this.delete(oldest);
    }
    super.delete(key); // move to end
    return super.set(key, value);
  }
}

const balanceCache = new BoundedMap(10_000); // wallet -> { balance, checkedAt }

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

const treasuryBalanceCache = { sol: 0, usdc: 0, usd: 0, solPrice: 0, checkedAt: 0 };
const TREASURY_CACHE_TTL = 5 * 60 * 1000;

export {
  balanceCache,
  tradingWallets, tradingPositions, tradeHistory, activeDCA, activeCopyTraders, activeTriggers, safetyManagers,
  VALID_API_IDS,
  getTreasuryState, setTreasuryState,
  treasuryBalanceCache, TREASURY_CACHE_TTL,
};
