// ═══════════════════════════════════════════════════
// INFINITE Protocol — Treasury Agent v3
// ═══════════════════════════════════════════════════
//
// AUTOMATED PAYMENT PIPELINE:
//
//   1. Creator fees (SOL) flow into treasury wallet
//   2. Agent swaps SOL → USDC via Jupiter (existing)
//   3. USDC splits two ways:
//      a. Skyfire — direct API credit purchasing (existing)
//      b. Bridge.xyz — USDC → USD off-ramp to bank account
//   4. Bank account funds Privacy.com virtual cards
//   5. Each vendor (Anthropic, OpenAI, etc.) has a
//      merchant-locked card with spending limits
//   6. Cards auto-adjust limits based on treasury health
//   7. x402 protocol handles crypto-native API payments
//
// ═══════════════════════════════════════════════════

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const CONFIG = {
  HELIUS_RPC_URL: process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY',
  TREASURY_WALLET: process.env.TREASURY_WALLET || '',
  DEV_WALLET: process.env.DEV_WALLET || '',

  PROXY_URL: process.env.PROXY_URL || 'http://localhost:3001',
  PROXY_ADMIN_KEY: process.env.PROXY_ADMIN_KEY || '',
  DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL || '',

  // Real API costs per model (avg per call, conservative)
  COSTS: {
    'claude-sonnet-4-6': 0.015,
    'claude-opus-4-6': 0.06,
    'gemini-2.5-flash': 0.002,
    'gemini-2.5-pro': 0.01,
  },
  BLENDED_AVG_COST: 0.02,

  SOL_PRICE_USD: 88,

  MIN_RUNWAY_DAYS: 7,
  TARGET_RUNWAY_DAYS: 30,
  CRITICAL_RUNWAY_DAYS: 3,

  BALANCE_CHECK_MS: 5 * 60 * 1000,
  PRICE_UPDATE_MS: 15 * 60 * 1000,
  REPORT_MS: 60 * 60 * 1000,

  // Payment automation
  PRIVACY_API_KEY: process.env.PRIVACY_API_KEY || '',
  PRIVACY_BASE_URL: process.env.PRIVACY_SANDBOX === 'true'
    ? 'https://sandbox.privacy.com/v1'
    : 'https://api.privacy.com/v1',

  BRIDGE_API_KEY: process.env.BRIDGE_API_KEY || '',
  BRIDGE_BASE_URL: process.env.BRIDGE_SANDBOX === 'true'
    ? 'https://api.sandbox.bridge.xyz/v0'
    : 'https://api.bridge.xyz/v0',
  BRIDGE_CUSTOMER_ID: process.env.BRIDGE_CUSTOMER_ID || '',
  BRIDGE_LIQUIDATION_ADDRESS: process.env.BRIDGE_LIQUIDATION_ADDRESS || '',
  BRIDGE_LIQ_ADDR_ID: process.env.BRIDGE_LIQ_ADDR_ID || '',

  MAX_DAILY_OFFRAMP_USD: parseFloat(process.env.MAX_DAILY_OFFRAMP_USD || '200'),
  MIN_OFFRAMP_AMOUNT: parseFloat(process.env.MIN_OFFRAMP_AMOUNT || '10'),

  // Vendor card limits (cents)
  VENDOR_LIMITS: {
    anthropic: 50000,
    openai: 50000,
    google: 20000,
    helius: 10000,
    railway: 5000,
    render: 5000,
    upstash: 5000,
  },
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

  // Payment automation
  cards: {},             // vendor -> { cardToken, lastFour, state }
  cardSpendMonth: {},    // vendor -> totalCents this month
  offrampTodayUsd: 0,
  offrampLastReset: new Date().toISOString().slice(0, 10),
  x402TodayUsd: 0,
  x402LastReset: new Date().toISOString().slice(0, 10),
  lastDrainCheck: null,
  pendingDrains: [],     // { drainId, amountUsd, state, createdAt }
};

// ─── SOL Price ──────────────────────────────────────────────

async function updateSolPrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json();
    const price = parseFloat(data?.solana?.usd);
    if (price > 0) state.solPriceUsd = price;
  } catch (err) {
    console.error('[SOL Price] Failed to fetch:', err.message);
  }
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
    const res = await fetch(`${CONFIG.PROXY_URL}/stats`, { signal: AbortSignal.timeout(10_000) });
    const data = await res.json();
    state.dailyCallsUsed = data.totalCallsToday || 0;
    state.activeKeys = data.activeKeys || 0;
  } catch (err) {
    console.error('[Proxy Stats] Failed to fetch:', err.message);
  }
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
    fetchProxyStats().then(() => postToDiscord(generateReport(), true));
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
        runwayDays: state.runwayDays === Infinity ? 999 : Math.round(state.runwayDays),
        dailyBudget: state.dailyCallsBudget,
        treasuryBalanceUsd: state.treasuryBalanceUsd,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error('[Push Limits] Failed to push to proxy:', err.message);
  }
}

// ─── Reimbursement ──────────────────────────────────────────

function getReimbursementStatus() {
  const pending = state.pendingReimbursementUsd;
  const pendingSol = state.solPriceUsd > 0 ? pending / state.solPriceUsd : 0;
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

// ─── Privacy.com Cards ──────────────────────────────────────

async function privacyFetch(method, path, body = null) {
  if (!CONFIG.PRIVACY_API_KEY) return null;
  const opts = {
    method,
    headers: { 'Authorization': `api-key ${CONFIG.PRIVACY_API_KEY}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${CONFIG.PRIVACY_BASE_URL}${path}`, opts);
  if (!res.ok) throw new Error(`Privacy ${method} ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function syncCards() {
  if (!CONFIG.PRIVACY_API_KEY) return;
  try {
    const { data } = await privacyFetch('GET', '/cards?page=1&page_size=50');
    for (const card of data) {
      const match = card.memo?.match(/^INFINITE-(\w+)$/);
      if (!match) continue;
      state.cards[match[1]] = {
        cardToken: card.token,
        lastFour: card.last_four,
        state: card.state,
        spendLimit: card.spend_limit,
      };
    }
    console.log(`[Cards] Synced ${Object.keys(state.cards).length} vendor cards`);
  } catch (err) {
    console.error('[Cards] Sync failed:', err.message);
  }
}

async function adjustCardLimits() {
  if (!CONFIG.PRIVACY_API_KEY) return;
  const multiplier = state.healthStatus === 'surplus' ? 1.0
    : state.healthStatus === 'healthy' ? 1.0
    : state.healthStatus === 'cautious' ? 0.7
    : 0.3;

  for (const [vendor, defaultLimit] of Object.entries(CONFIG.VENDOR_LIMITS)) {
    const card = state.cards[vendor];
    if (!card || card.state === 'CLOSED') continue;
    const targetLimit = Math.round(defaultLimit * multiplier);
    if (card.spendLimit === targetLimit) continue;
    try {
      await privacyFetch('PATCH', `/cards/${card.cardToken}`, { spend_limit: targetLimit, spend_limit_duration: 'MONTHLY' });
      card.spendLimit = targetLimit;
      console.log(`[Cards] ${vendor}: limit → $${(targetLimit / 100).toFixed(2)}/mo`);
    } catch (err) {
      console.error(`[Cards] Failed to adjust ${vendor}:`, err.message);
    }
  }
}

async function fetchCardSpending() {
  if (!CONFIG.PRIVACY_API_KEY) return {};
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = now.toISOString().slice(0, 10);
  const spending = {};

  for (const [vendor, card] of Object.entries(state.cards)) {
    if (!card.cardToken) continue;
    try {
      const { data } = await privacyFetch('GET', `/transactions?card_token=${card.cardToken}&result=APPROVED&begin=${monthStart}&end=${monthEnd}&page=1&page_size=100`);
      const totalCents = data.reduce((sum, tx) => sum + (tx.amount || 0), 0);
      spending[vendor] = +(totalCents / 100).toFixed(2);
    } catch (err) {
      console.error(`[Cards] Failed to fetch ${vendor} spending:`, err.message);
    }
  }
  state.cardSpendMonth = spending;
  return spending;
}

// ─── Bridge.xyz Drains ──────────────────────────────────────

async function bridgeFetch(method, path) {
  if (!CONFIG.BRIDGE_API_KEY) return null;
  const res = await fetch(`${CONFIG.BRIDGE_BASE_URL}${path}`, {
    method,
    headers: { 'Api-Key': CONFIG.BRIDGE_API_KEY, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Bridge ${method} ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function checkDrainStatus() {
  if (!CONFIG.BRIDGE_API_KEY || !CONFIG.BRIDGE_CUSTOMER_ID || !CONFIG.BRIDGE_LIQ_ADDR_ID) return;
  try {
    const { data } = await bridgeFetch('GET',
      `/customers/${CONFIG.BRIDGE_CUSTOMER_ID}/liquidation_addresses/${CONFIG.BRIDGE_LIQ_ADDR_ID}/drains?page=1&page_size=10`
    );
    state.pendingDrains = data
      .filter(d => d.state !== 'payment_processed')
      .map(d => ({ drainId: d.id, amountUsd: parseFloat(d.amount), state: d.state, createdAt: d.created_at }));

    const failed = data.filter(d => ['undeliverable', 'returned', 'error'].includes(d.state));
    if (failed.length > 0) {
      console.error(`[Bridge] ${failed.length} failed drain(s) — manual intervention needed`);
    }
    state.lastDrainCheck = Date.now();
  } catch (err) {
    console.error('[Bridge] Drain check failed:', err.message);
  }
}

function resetDailyTrackers() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.offrampLastReset !== today) {
    state.offrampTodayUsd = 0;
    state.offrampLastReset = today;
  }
  if (state.x402LastReset !== today) {
    state.x402TodayUsd = 0;
    state.x402LastReset = today;
  }
}

// ─── Discord Webhook ────────────────────────────────────────

const HEALTH_EMOJI = { surplus: '\u{1F7E2}', healthy: '\u{1F535}', cautious: '\u{1F7E1}', critical: '\u{1F534}', unknown: '\u2B1C' };

async function postToDiscord(report, isAlert = false) {
  if (!CONFIG.DISCORD_WEBHOOK_URL) return;
  try {
    const h = report.budget.health;
    const runway = report.budget.runway === 'infinite' ? '\u221E' : `${report.budget.runway}d`;
    const embed = {
      title: isAlert ? `\u26A0\uFE0F Status Change: ${h.toUpperCase()}` : '\u221E Treasury Report',
      color: h === 'surplus' ? 0x00ff00 : h === 'healthy' ? 0x3498db : h === 'cautious' ? 0xf1c40f : h === 'critical' ? 0xe74c3c : 0x95a5a6,
      fields: [
        { name: 'Treasury', value: `${report.treasury.sol} SOL ($${report.treasury.usd})`, inline: true },
        { name: 'SOL Price', value: `$${report.treasury.solPrice}`, inline: true },
        { name: 'Health', value: `${HEALTH_EMOJI[h] || ''} ${h} (${report.budget.multiplier}x)`, inline: true },
        { name: 'Runway', value: runway, inline: true },
        { name: 'Daily Budget', value: `${report.budget.dailyBudget} calls`, inline: true },
        { name: 'Active Keys', value: `${report.usage.activeKeys}`, inline: true },
        { name: 'Calls Today', value: `${report.usage.callsToday}`, inline: true },
        { name: 'Daily Spend', value: `$${report.usage.dailySpendUsd}`, inline: true },
        { name: 'Inflows (24h)', value: `$${report.inflows24h.usd} (${report.inflows24h.sol} SOL)`, inline: true },
      ],
      footer: { text: `Net: $${report.net.dailyUsd}/day \u2022 ${report.net.sustainable ? 'Sustainable' : 'Burning reserves'}` },
      timestamp: report.timestamp,
    };
    await fetch(CONFIG.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error('[Discord]', err.message);
  }
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
    payments: {
      cards: Object.fromEntries(Object.entries(state.cards).map(([v, c]) => [v, { lastFour: c.lastFour, state: c.state, limitUsd: +(c.spendLimit / 100).toFixed(2) }])),
      cardSpendMonth: state.cardSpendMonth,
      offrampTodayUsd: +state.offrampTodayUsd.toFixed(2),
      pendingDrains: state.pendingDrains.length,
      x402TodayUsd: +state.x402TodayUsd.toFixed(2),
    },
  };
}

// ─── OpenClaw Skills ────────────────────────────────────────

export const skills = {
  'treasury-monitor': {
    description: 'Check treasury balance and health',
    handler: async () => { await checkBalance(); return { sol: state.treasuryBalanceSol, usd: state.treasuryBalanceUsd, health: state.healthStatus, runway: state.runwayDays }; },
  },
  'treasury-report': {
    description: 'Full treasury report including payment pipeline status',
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
  'card-status': {
    description: 'Check all Privacy.com vendor card states and spending',
    handler: async () => { await syncCards(); const spending = await fetchCardSpending(); return { cards: state.cards, monthlySpend: spending }; },
  },
  'card-adjust': {
    description: 'Adjust card spending limits based on current treasury health',
    handler: async () => { await syncCards(); await adjustCardLimits(); return { health: state.healthStatus, cards: state.cards }; },
  },
  'drain-status': {
    description: 'Check Bridge.xyz off-ramp drain status',
    handler: async () => { await checkDrainStatus(); return { pendingDrains: state.pendingDrains, lastCheck: state.lastDrainCheck }; },
  },
  'payment-summary': {
    description: 'Full payment pipeline summary: cards, off-ramp, x402',
    handler: async () => {
      await syncCards();
      const spending = await fetchCardSpending();
      await checkDrainStatus();
      resetDailyTrackers();
      return {
        cards: Object.fromEntries(Object.entries(state.cards).map(([v, c]) => [v, { lastFour: c.lastFour, state: c.state, limitUsd: +(c.spendLimit / 100).toFixed(2) }])),
        monthlySpend: spending,
        offramp: { todayUsd: state.offrampTodayUsd, maxDailyUsd: CONFIG.MAX_DAILY_OFFRAMP_USD, pendingDrains: state.pendingDrains },
        x402: { todayUsd: state.x402TodayUsd },
      };
    },
  },
};

// ─── HTTP + Daemon ──────────────────────────────────────────

async function startServer(port) {
  const { createServer } = await import('http');

  function requireAuth(req, res) {
    if (req.url === '/health') return true; // health is public
    const authHeader = req.headers.authorization;
    if (!CONFIG.PROXY_ADMIN_KEY) { res.statusCode = 503; res.end('{"error":"admin_not_configured"}'); return false; }
    if (!authHeader || authHeader !== `Bearer ${CONFIG.PROXY_ADMIN_KEY}`) {
      res.statusCode = 401; res.end('{"error":"unauthorized"}'); return false;
    }
    return true;
  }

  createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', CONFIG.PROXY_URL);
    if (!requireAuth(req, res)) return;
    if (req.url === '/health') res.end(JSON.stringify({ ok: true }));
    else if (req.url === '/treasury') res.end(JSON.stringify({ sol: state.treasuryBalanceSol, usd: state.treasuryBalanceUsd, health: state.healthStatus, runway: state.runwayDays, multiplier: state.rateMultiplier, budget: state.dailyCallsBudget }));
    else if (req.url === '/report') { await fetchProxyStats(); res.end(JSON.stringify(generateReport())); }
    else if (req.url === '/reimbursement') res.end(JSON.stringify(getReimbursementStatus()));
    else if (req.url === '/payments') res.end(JSON.stringify({ cards: state.cards, cardSpendMonth: state.cardSpendMonth, offrampTodayUsd: state.offrampTodayUsd, pendingDrains: state.pendingDrains, x402TodayUsd: state.x402TodayUsd }));
    else { res.statusCode = 404; res.end('{}'); }
  }).listen(port, () => console.log(`[Agent] :${port}`));
}

async function start() {
  console.log(`∞ INFINITE Treasury Agent v3\n  Treasury: ${CONFIG.TREASURY_WALLET?.slice(0, 8) || 'NOT SET'}...\n  Proxy: ${CONFIG.PROXY_URL}\n  Payments: ${CONFIG.PRIVACY_API_KEY ? 'Privacy.com' : 'disabled'} | ${CONFIG.BRIDGE_API_KEY ? 'Bridge.xyz' : 'disabled'}`);
  await updateSolPrice();
  await checkBalance();
  await fetchProxyStats();
  await syncCards();
  await checkDrainStatus();
  await pushLimits();
  console.log(JSON.stringify(generateReport(), null, 2));

  setInterval(checkBalance, CONFIG.BALANCE_CHECK_MS);
  setInterval(updateSolPrice, CONFIG.PRICE_UPDATE_MS);
  setInterval(fetchProxyStats, CONFIG.BALANCE_CHECK_MS);
  setInterval(pushLimits, CONFIG.BALANCE_CHECK_MS);
  setInterval(resetDailyTrackers, 60 * 60 * 1000);
  setInterval(checkDrainStatus, 30 * 60 * 1000); // check drains every 30m
  setInterval(async () => {
    recordDailySpend();
    const report = generateReport();
    console.log(JSON.stringify(report, null, 2));
    await postToDiscord(report);
  }, CONFIG.REPORT_MS);
}

if (process.argv[1]?.includes('index') || process.argv[1]?.includes('treasury')) {
  start().catch(err => {
    console.error('[FATAL] Agent startup failed:', err);
    process.exit(1);
  });
  startServer(parseInt(process.env.AGENT_PORT || '3002'));

  process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception:', err);
  });
  process.on('unhandledRejection', (err) => {
    console.error('[FATAL] Unhandled rejection:', err);
  });
}

export default { skills, state, generateReport, getReimbursementStatus, syncCards, adjustCardLimits, fetchCardSpending, checkDrainStatus };
