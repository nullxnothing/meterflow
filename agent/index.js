// ═══════════════════════════════════════════════════
// INFINITE Protocol — Treasury Agent v2
// ═══════════════════════════════════════════════════
//
// HOW API BILLING ACTUALLY WORKS:
//
// Anthropic/Google charge pay-per-use to an account with
// a credit card. You can't pay them in SOL. So:
//
//   1. Your Anthropic/Google accounts hold the master API keys
//   2. The INFINITE proxy routes all user requests through them
//   3. Anthropic/Google bill YOUR accounts for the usage
//   4. Creator fees (SOL) accumulate in the treasury wallet
//   5. This agent tracks costs vs treasury, manages rate limits
//   6. You periodically claim reimbursement from the treasury
//      to cover what Anthropic/Google charged you
//
// The treasury is the FUNDING SOURCE, not the payment method.
// You front the API costs. Treasury reimburses you.
//
// ═══════════════════════════════════════════════════

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const CONFIG = {
  HELIUS_RPC_URL: process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY',
  TREASURY_WALLET: process.env.TREASURY_WALLET || '',
  DEV_WALLET: process.env.DEV_WALLET || '',

  PROXY_URL: process.env.PROXY_URL || 'http://localhost:3001',
  PROXY_ADMIN_KEY: process.env.PROXY_ADMIN_KEY || '',

  // Real API costs per model (avg per call, conservative)
  COSTS: {
    'claude-sonnet-4-5-20250929': 0.015,
    'claude-opus-4-6': 0.06,
    'gemini-2.5-flash': 0.002,
    'gemini-2.5-pro': 0.01,
  },
  BLENDED_AVG_COST: 0.02,

  SOL_PRICE_USD: 150,

  MIN_RUNWAY_DAYS: 7,
  TARGET_RUNWAY_DAYS: 30,
  CRITICAL_RUNWAY_DAYS: 3,

  BALANCE_CHECK_MS: 5 * 60 * 1000,
  PRICE_UPDATE_MS: 15 * 60 * 1000,
  REPORT_MS: 60 * 60 * 1000,
};

const state = {
  treasuryBalanceSol: 0,
  treasuryBalanceUsd: 0,
  solPriceUsd: CONFIG.SOL_PRICE_USD,

  // Reimbursement ledger
  totalApiSpendUsd: 0,
  totalReimbursedUsd: 0,
  pendingReimbursementUsd: 0,

  // Budget
  totalCallsFundable: 0,
  dailyCallsBudget: 0,
  runwayDays: 0,
  healthStatus: 'unknown',
  rateMultiplier: 1.0,

  // From proxy
  dailyCallsUsed: 0,
  activeKeys: 0,

  inflowHistory: [],
  reimbursements: [],
  lastBalanceCheck: null,
  startedAt: Date.now(),
};

// ─── SOL Price ──────────────────────────────────────────────

async function updateSolPrice() {
  try {
    const res = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
    const data = await res.json();
    const price = parseFloat(data?.data?.['So11111111111111111111111111111111111111112']?.price);
    if (price > 0) state.solPriceUsd = price;
  } catch {}
}

// ─── Treasury Balance ───────────────────────────────────────

async function checkBalance() {
  if (!CONFIG.TREASURY_WALLET) return;
  try {
    const conn = new Connection(CONFIG.HELIUS_RPC_URL);
    const lamports = await conn.getBalance(new PublicKey(CONFIG.TREASURY_WALLET));
    const sol = lamports / LAMPORTS_PER_SOL;
    const usd = sol * state.solPriceUsd;

    if (state.treasuryBalanceSol > 0 && sol > state.treasuryBalanceSol) {
      const inflowSol = sol - state.treasuryBalanceSol;
      state.inflowHistory.push({ timestamp: Date.now(), sol: inflowSol, usd: inflowSol * state.solPriceUsd });
      console.log(`[Treasury] +${inflowSol.toFixed(4)} SOL ($${(inflowSol * state.solPriceUsd).toFixed(2)})`);
    }

    state.treasuryBalanceSol = sol;
    state.treasuryBalanceUsd = usd;
    state.lastBalanceCheck = Date.now();
    recalculate();
  } catch (err) {
    console.error('[Treasury]', err.message);
  }
}

// ─── Proxy Stats ────────────────────────────────────────────

async function fetchProxyStats() {
  try {
    const res = await fetch(`${CONFIG.PROXY_URL}/stats`);
    const data = await res.json();
    state.dailyCallsUsed = data.totalCallsToday || 0;
    state.activeKeys = data.activeKeys || 0;
  } catch {}
}

// ─── Budget ─────────────────────────────────────────────────

function recalculate() {
  const { treasuryBalanceUsd } = state;
  state.totalCallsFundable = Math.floor(treasuryBalanceUsd / CONFIG.BLENDED_AVG_COST);
  state.dailyCallsBudget = Math.floor(state.totalCallsFundable / CONFIG.TARGET_RUNWAY_DAYS);

  const dailySpend = state.dailyCallsUsed * CONFIG.BLENDED_AVG_COST;
  const oneDayAgo = Date.now() - 86400000;
  const dailyInflow = state.inflowHistory.filter(i => i.timestamp > oneDayAgo).reduce((s, i) => s + i.usd, 0);
  const netBurn = dailySpend - dailyInflow;

  state.runwayDays = netBurn <= 0 ? Infinity : treasuryBalanceUsd / netBurn;
  state.pendingReimbursementUsd = state.totalApiSpendUsd - state.totalReimbursedUsd;

  const old = state.rateMultiplier;
  if (state.runwayDays >= CONFIG.TARGET_RUNWAY_DAYS * 2) {
    state.healthStatus = 'surplus'; state.rateMultiplier = 1.5;
  } else if (state.runwayDays >= CONFIG.MIN_RUNWAY_DAYS) {
    state.healthStatus = 'healthy'; state.rateMultiplier = 1.0;
  } else if (state.runwayDays >= CONFIG.CRITICAL_RUNWAY_DAYS) {
    state.healthStatus = 'cautious'; state.rateMultiplier = 0.7;
  } else {
    state.healthStatus = 'critical'; state.rateMultiplier = 0.3;
  }

  if (old !== state.rateMultiplier) {
    console.log(`[Budget] ${old}x → ${state.rateMultiplier}x (${state.healthStatus})`);
    pushLimits();
  }
}

// ─── Push to Proxy ──────────────────────────────────────────

async function pushLimits() {
  if (!CONFIG.PROXY_ADMIN_KEY) return;
  try {
    await fetch(`${CONFIG.PROXY_URL}/admin/rate-limits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CONFIG.PROXY_ADMIN_KEY}` },
      body: JSON.stringify({
        multiplier: state.rateMultiplier,
        healthStatus: state.healthStatus,
        runwayDays: state.runwayDays,
        dailyBudget: state.dailyCallsBudget,
        treasuryBalanceUsd: state.treasuryBalanceUsd,
      }),
    });
  } catch {}
}

// ─── Reimbursement ──────────────────────────────────────────

function getReimbursementStatus() {
  const pending = state.pendingReimbursementUsd;
  const pendingSol = pending / state.solPriceUsd;
  return {
    totalApiSpend: +state.totalApiSpendUsd.toFixed(2),
    totalReimbursed: +state.totalReimbursedUsd.toFixed(2),
    pendingUsd: +pending.toFixed(2),
    pendingSol: +pendingSol.toFixed(4),
    treasuryCanCover: state.treasuryBalanceUsd >= pending,
    instruction: state.treasuryBalanceUsd >= pending
      ? `Claim ${pendingSol.toFixed(4)} SOL ($${pending.toFixed(2)}) from treasury → dev wallet`
      : `Treasury short $${(pending - state.treasuryBalanceUsd).toFixed(2)} — wait for more volume`,
  };
}

function recordDailySpend() {
  const spend = state.dailyCallsUsed * CONFIG.BLENDED_AVG_COST;
  state.totalApiSpendUsd += spend;
  state.pendingReimbursementUsd = state.totalApiSpendUsd - state.totalReimbursedUsd;
}

function recordReimbursement(amountUsd, txSig = null) {
  state.totalReimbursedUsd += amountUsd;
  state.pendingReimbursementUsd = state.totalApiSpendUsd - state.totalReimbursedUsd;
  state.reimbursements.push({ timestamp: Date.now(), amountUsd, sol: amountUsd / state.solPriceUsd, txSig });
}

// ─── Report ─────────────────────────────────────────────────

function generateReport() {
  const oneDayAgo = Date.now() - 86400000;
  const inflows = state.inflowHistory.filter(i => i.timestamp > oneDayAgo);
  const inflowUsd = inflows.reduce((s, i) => s + i.usd, 0);
  const spendUsd = state.dailyCallsUsed * CONFIG.BLENDED_AVG_COST;

  return {
    timestamp: new Date().toISOString(),
    treasury: { sol: +state.treasuryBalanceSol.toFixed(4), usd: +state.treasuryBalanceUsd.toFixed(2), solPrice: +state.solPriceUsd.toFixed(2) },
    budget: { callsFundable: state.totalCallsFundable, dailyBudget: state.dailyCallsBudget, runway: state.runwayDays === Infinity ? 'infinite' : +state.runwayDays.toFixed(1), health: state.healthStatus, multiplier: state.rateMultiplier },
    usage: { callsToday: state.dailyCallsUsed, activeKeys: state.activeKeys, dailySpendUsd: +spendUsd.toFixed(2) },
    inflows24h: { usd: +inflowUsd.toFixed(2), sol: +inflows.reduce((s, i) => s + i.sol, 0).toFixed(4), txCount: inflows.length },
    reimbursement: getReimbursementStatus(),
    net: { dailyUsd: +(inflowUsd - spendUsd).toFixed(2), sustainable: inflowUsd >= spendUsd },
  };
}

// ─── OpenClaw Skills ────────────────────────────────────────

export const skills = {
  'treasury-monitor': {
    description: 'Check treasury balance and health',
    handler: async () => { await checkBalance(); return { sol: state.treasuryBalanceSol, usd: state.treasuryBalanceUsd, health: state.healthStatus, runway: state.runwayDays }; },
  },
  'treasury-report': {
    description: 'Full treasury report',
    handler: async () => { await checkBalance(); await fetchProxyStats(); return generateReport(); },
  },
  'reimbursement-status': {
    description: 'Check pending reimbursement amount',
    handler: async () => getReimbursementStatus(),
  },
  'record-reimbursement': {
    description: 'Record a reimbursement claim from treasury',
    handler: async ({ amountUsd, txSig }) => { recordReimbursement(amountUsd, txSig); return getReimbursementStatus(); },
  },
};

// ─── HTTP + Daemon ──────────────────────────────────────────

async function startServer(port) {
  const { createServer } = await import('http');
  createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url === '/health') res.end(JSON.stringify({ ok: true }));
    else if (req.url === '/treasury') res.end(JSON.stringify({ sol: state.treasuryBalanceSol, usd: state.treasuryBalanceUsd, health: state.healthStatus, runway: state.runwayDays, multiplier: state.rateMultiplier, budget: state.dailyCallsBudget }));
    else if (req.url === '/report') { await fetchProxyStats(); res.end(JSON.stringify(generateReport())); }
    else if (req.url === '/reimbursement') res.end(JSON.stringify(getReimbursementStatus()));
    else { res.statusCode = 404; res.end('{}'); }
  }).listen(port, () => console.log(`[Agent] :${port}`));
}

async function start() {
  console.log(`∞ INFINITE Treasury Agent v2\n  Treasury: ${CONFIG.TREASURY_WALLET?.slice(0, 8) || 'NOT SET'}...\n  Proxy: ${CONFIG.PROXY_URL}`);
  await updateSolPrice();
  await checkBalance();
  await fetchProxyStats();
  console.log(JSON.stringify(generateReport(), null, 2));

  setInterval(checkBalance, CONFIG.BALANCE_CHECK_MS);
  setInterval(updateSolPrice, CONFIG.PRICE_UPDATE_MS);
  setInterval(fetchProxyStats, CONFIG.BALANCE_CHECK_MS);
  setInterval(() => { recordDailySpend(); console.log(JSON.stringify(generateReport(), null, 2)); }, CONFIG.REPORT_MS);
}

if (process.argv[1]?.includes('index') || process.argv[1]?.includes('treasury')) {
  start();
  startServer(parseInt(process.env.AGENT_PORT || '3002'));
}

export default { skills, state, generateReport, getReimbursementStatus };
