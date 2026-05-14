// ═══════════════════════════════════════════
// Meterflow Dashboard — API Helpers
// ═══════════════════════════════════════════

import { STATE, API_BASE } from './state.js';

// ─── API Request Helper ───

const LOCAL_STATIC_DASHBOARD = window.location.hostname === 'localhost' && window.location.port === '3000';
const LOCAL_READ_MOCKS = {
  '/auth/tiers': {
    token: {
      symbol: 'MFLOW',
      mint: null,
      chain: 'solana',
      minSignal: 10000,
      protocolFeeBps: 100,
      holderProtocolFeeBps: 0,
      nonHolderProtocolFeeBps: 100,
      purchaseUrl: null,
      usdcPurchaseUrl: null,
    },
  },
  '/votes': { counts: {}, userVotes: [] },
  '/status/aggregate': {
    treasury: {
      healthStatus: 'unknown',
      runwayDays: 0,
      multiplier: 1,
      treasuryBalanceUsd: 0,
      treasuryBalanceSol: 0,
      treasuryBalanceUsdc: 0,
      solPrice: 0,
    },
    providers: { claude: false, gemini: false, openai: false },
    freeAccessEndsAt: null,
  },
  '/treasury': {
    healthStatus: 'unknown',
    runwayDays: 0,
    multiplier: 1,
    treasuryBalanceUsd: 0,
    treasuryBalanceSol: 0,
    treasuryBalanceUsdc: 0,
    solPrice: 0,
  },
  '/providers': { claude: false, gemini: false, openai: false },
  '/oauth/status': { github: false, google: false, notion: false },
};

function cloneLocalMock(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function localReadMock(path, opts) {
  const method = String(opts.method || 'GET').toUpperCase();
  if (!LOCAL_STATIC_DASHBOARD || method !== 'GET') return null;
  const key = path.split('?')[0];
  return Object.prototype.hasOwnProperty.call(LOCAL_READ_MOCKS, key)
    ? cloneLocalMock(LOCAL_READ_MOCKS[key])
    : null;
}

export async function api(path, opts = {}) {
  const mock = localReadMock(path, opts);
  if (mock) return mock;

  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  if (STATE.apiKeyFull) headers['Authorization'] = `Bearer ${STATE.apiKeyFull}`;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  } catch {
    throw new Error('API unreachable. The proxy server may not be deployed yet.');
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Server error: ${res.status}`); }
  if (!res.ok) {
    const err = new Error(data.message || data.error || `HTTP ${res.status}`);
    err.status = res.status;
    Object.assign(err, data);
    throw err;
  }
  return data;
}
