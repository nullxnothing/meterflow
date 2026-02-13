// ═══════════════════════════════════════════════════
// INFINITE Protocol — Treasury Agent
// ═══════════════════════════════════════════════════
//
// Autonomous agent that manages the API treasury:
//
// 1. MONITOR  — Watch treasury wallet for SOL inflows (creator fees)
// 2. BUDGET   — Calculate how many API calls the treasury can fund
// 3. ADJUST   — Dynamically set rate limits on the proxy server
// 4. REPORT   — Generate health reports for the dashboard
// 5. CONVERT  — (Future) Auto-swap SOL → USDC for API credit purchases
//
// Runs as an OpenClaw skill or standalone Node.js process.
// ═══════════════════════════════════════════════════

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

// ─── Config ─────────────────────────────────────────────────

const CONFIG = {
  // Solana
  HELIUS_RPC_URL: process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY',
  TREASURY_WALLET: process.env.TREASURY_WALLET || '', // Public key of the 50% API treasury wallet
  
  // API Proxy
  PROXY_ADMIN_URL: process.env.PROXY_ADMIN_URL || 'http://localhost:3001',
  PROXY_ADMIN_KEY: process.env.PROXY_ADMIN_KEY || '',
  
  // Cost assumptions (conservative estimates)
  COST_PER_CALL_USD: parseFloat(process.env.COST_PER_CALL_USD || '0.02'), // Avg cost across models
  SOL_PRICE_USD: parseFloat(process.env.SOL_PRICE_USD || '150'),          // Updated by price feed
  
  // Budget thresholds
  MIN_RUNWAY_DAYS: 7,        // Minimum days of runway before reducing limits
  TARGET_RUNWAY_DAYS: 30,    // Target runway to maintain
  CRITICAL_RUNWAY_DAYS: 3,   // Emergency mode — heavily restrict access
  
  // Rate limit multipliers (applied to base tier limits)
  MULTIPLIER_HEALTHY: 1.0,   // Full limits
  MULTIPLIER_CAUTIOUS: 0.7,  // 70% of normal limits
  MULTIPLIER_CRITICAL: 0.3,  // 30% of normal limits — emergency
  MULTIPLIER_SURPLUS: 1.5,   // 150% — treasury is flush, give more
  
  // Monitoring intervals
  BALANCE_CHECK_INTERVAL_MS: 5 * 60 * 1000,   // Check balance every 5 min
  PRICE_UPDATE_INTERVAL_MS: 15 * 60 * 1000,    // Update SOL price every 15 min
  REPORT_INTERVAL_MS: 60 * 60 * 1000,          // Full report every hour
  
  // History
  MAX_HISTORY_ENTRIES: 1000,
};

// ─── State ──────────────────────────────────────────────────

const state = {
  // Current snapshot
  treasuryBalanceSol: 0,
  treasuryBalanceUsd: 0,
  solPriceUsd: CONFIG.SOL_PRICE_USD,
  
  // Budget calculations
  totalApiCallsBudget: 0,       // Total calls the treasury can fund
  dailyApiCallsBudget: 0,       // Daily budget at target runway
  currentRunwayDays: 0,
  currentMultiplier: 1.0,
  healthStatus: 'unknown',      // healthy | cautious | critical | surplus
  
  // Usage tracking (from proxy)
  dailyCallsUsed: 0,
  dailyCallsLimit: 0,
  activeKeys: 0,
  
  // History
  balanceHistory: [],           // { timestamp, balanceSol, balanceUsd }
  inflowHistory: [],            // { timestamp, amountSol, txSignature }
  adjustmentHistory: [],        // { timestamp, oldMultiplier, newMultiplier, reason }
  
  // Timestamps
  lastBalanceCheck: null,
  lastPriceUpdate: null,
  lastReport: null,
  startedAt: Date.now(),
};

// ─── Core: Balance Monitor ──────────────────────────────────

async function checkTreasuryBalance() {
  if (!CONFIG.TREASURY_WALLET) {
    console.warn('[Treasury] No treasury wallet configured');
    return;
  }
  
  try {
    const connection = new Connection(CONFIG.HELIUS_RPC_URL);
    const pubkey = new PublicKey(CONFIG.TREASURY_WALLET);
    
    const balanceLamports = await connection.getBalance(pubkey);
    const balanceSol = balanceLamports / LAMPORTS_PER_SOL;
    const balanceUsd = balanceSol * state.solPriceUsd;
    
    // Detect inflow (balance increased since last check)
    if (state.treasuryBalanceSol > 0 && balanceSol > state.treasuryBalanceSol) {
      const inflowSol = balanceSol - state.treasuryBalanceSol;
      state.inflowHistory.push({
        timestamp: Date.now(),
        amountSol: inflowSol,
        amountUsd: inflowSol * state.solPriceUsd,
      });
      
      // Trim history
      if (state.inflowHistory.length > CONFIG.MAX_HISTORY_ENTRIES) {
        state.inflowHistory = state.inflowHistory.slice(-CONFIG.MAX_HISTORY_ENTRIES);
      }
      
      console.log(`[Treasury] Inflow detected: +${inflowSol.toFixed(4)} SOL ($${(inflowSol * state.solPriceUsd).toFixed(2)})`);
    }
    
    // Update state
    state.treasuryBalanceSol = balanceSol;
    state.treasuryBalanceUsd = balanceUsd;
    state.lastBalanceCheck = Date.now();
    
    // Record history
    state.balanceHistory.push({
      timestamp: Date.now(),
      balanceSol,
      balanceUsd,
    });
    
    if (state.balanceHistory.length > CONFIG.MAX_HISTORY_ENTRIES) {
      state.balanceHistory = state.balanceHistory.slice(-CONFIG.MAX_HISTORY_ENTRIES);
    }
    
    // Recalculate budget
    recalculateBudget();
    
    console.log(`[Treasury] Balance: ${balanceSol.toFixed(4)} SOL ($${balanceUsd.toFixed(2)}) | Runway: ${state.currentRunwayDays.toFixed(1)} days | Status: ${state.healthStatus}`);
    
  } catch (err) {
    console.error('[Treasury] Balance check failed:', err.message);
  }
}

// ─── Core: Budget Calculator ────────────────────────────────

function recalculateBudget() {
  const { treasuryBalanceUsd } = state;
  
  // Total API calls the treasury can fund right now
  state.totalApiCallsBudget = Math.floor(treasuryBalanceUsd / CONFIG.COST_PER_CALL_USD);
  
  // Calculate daily budget based on target runway
  state.dailyApiCallsBudget = Math.floor(state.totalApiCallsBudget / CONFIG.TARGET_RUNWAY_DAYS);
  
  // Estimate runway based on current daily usage
  const avgDailySpendUsd = state.dailyCallsUsed > 0
    ? state.dailyCallsUsed * CONFIG.COST_PER_CALL_USD
    : state.dailyApiCallsBudget * CONFIG.COST_PER_CALL_USD; // Estimate if no usage data
  
  state.currentRunwayDays = avgDailySpendUsd > 0
    ? treasuryBalanceUsd / avgDailySpendUsd
    : CONFIG.TARGET_RUNWAY_DAYS; // Default if no spend
  
  // Estimate daily inflow from last 24h of inflow history
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentInflows = state.inflowHistory.filter(i => i.timestamp > oneDayAgo);
  const dailyInflowUsd = recentInflows.reduce((sum, i) => sum + i.amountUsd, 0);
  
  // Adjust runway considering inflows
  if (dailyInflowUsd > 0 && avgDailySpendUsd > 0) {
    const netDailyBurn = avgDailySpendUsd - dailyInflowUsd;
    if (netDailyBurn > 0) {
      state.currentRunwayDays = treasuryBalanceUsd / netDailyBurn;
    } else {
      // Inflows exceed spend — treasury is growing
      state.currentRunwayDays = Infinity;
    }
  }
  
  // Determine health status and multiplier
  const oldMultiplier = state.currentMultiplier;
  
  if (state.currentRunwayDays >= CONFIG.TARGET_RUNWAY_DAYS * 2) {
    state.healthStatus = 'surplus';
    state.currentMultiplier = CONFIG.MULTIPLIER_SURPLUS;
  } else if (state.currentRunwayDays >= CONFIG.MIN_RUNWAY_DAYS) {
    state.healthStatus = 'healthy';
    state.currentMultiplier = CONFIG.MULTIPLIER_HEALTHY;
  } else if (state.currentRunwayDays >= CONFIG.CRITICAL_RUNWAY_DAYS) {
    state.healthStatus = 'cautious';
    state.currentMultiplier = CONFIG.MULTIPLIER_CAUTIOUS;
  } else {
    state.healthStatus = 'critical';
    state.currentMultiplier = CONFIG.MULTIPLIER_CRITICAL;
  }
  
  // Log adjustment if multiplier changed
  if (oldMultiplier !== state.currentMultiplier) {
    state.adjustmentHistory.push({
      timestamp: Date.now(),
      oldMultiplier,
      newMultiplier: state.currentMultiplier,
      reason: `Runway ${state.currentRunwayDays.toFixed(1)} days → status: ${state.healthStatus}`,
    });
    
    console.log(`[Treasury] Rate limit adjustment: ${oldMultiplier}x → ${state.currentMultiplier}x (${state.healthStatus})`);
    
    // Push new limits to proxy
    pushRateLimits();
  }
}

// ─── Core: Rate Limit Pusher ────────────────────────────────

async function pushRateLimits() {
  if (!CONFIG.PROXY_ADMIN_URL || !CONFIG.PROXY_ADMIN_KEY) {
    console.warn('[Treasury] Cannot push rate limits — proxy admin not configured');
    return;
  }
  
  try {
    const response = await fetch(`${CONFIG.PROXY_ADMIN_URL}/admin/rate-limits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.PROXY_ADMIN_KEY}`,
      },
      body: JSON.stringify({
        multiplier: state.currentMultiplier,
        healthStatus: state.healthStatus,
        runwayDays: state.currentRunwayDays,
        dailyBudget: state.dailyApiCallsBudget,
        treasuryBalanceUsd: state.treasuryBalanceUsd,
        updatedAt: Date.now(),
      }),
    });
    
    if (response.ok) {
      console.log(`[Treasury] Pushed rate limits to proxy: ${state.currentMultiplier}x`);
    } else {
      console.error(`[Treasury] Failed to push rate limits: ${response.status}`);
    }
  } catch (err) {
    console.error('[Treasury] Push rate limits error:', err.message);
  }
}

// ─── Core: SOL Price Feed ───────────────────────────────────

async function updateSolPrice() {
  try {
    // Use Jupiter price API (free, no key needed)
    const response = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
    const data = await response.json();
    
    const price = parseFloat(data?.data?.['So11111111111111111111111111111111111111112']?.price);
    
    if (price && price > 0) {
      state.solPriceUsd = price;
      state.lastPriceUpdate = Date.now();
      console.log(`[Treasury] SOL price updated: $${price.toFixed(2)}`);
    }
  } catch (err) {
    console.error('[Treasury] Price update failed:', err.message);
    // Keep using last known price
  }
}

// ─── Core: Proxy Stats Fetcher ──────────────────────────────

async function fetchProxyStats() {
  if (!CONFIG.PROXY_ADMIN_URL) return;
  
  try {
    const response = await fetch(`${CONFIG.PROXY_ADMIN_URL}/stats`);
    const data = await response.json();
    
    state.dailyCallsUsed = data.totalCallsToday || 0;
    state.activeKeys = data.activeKeys || 0;
    
  } catch (err) {
    // Proxy might not be running yet — that's fine
  }
}

// ─── Report Generator ───────────────────────────────────────

function generateReport() {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentInflows = state.inflowHistory.filter(i => i.timestamp > oneDayAgo);
  const dailyInflowSol = recentInflows.reduce((sum, i) => sum + i.amountSol, 0);
  const dailyInflowUsd = recentInflows.reduce((sum, i) => sum + i.amountUsd, 0);
  
  const dailySpendUsd = state.dailyCallsUsed * CONFIG.COST_PER_CALL_USD;
  const netDailyUsd = dailyInflowUsd - dailySpendUsd;
  
  const report = {
    timestamp: Date.now(),
    
    treasury: {
      balanceSol: state.treasuryBalanceSol,
      balanceUsd: state.treasuryBalanceUsd,
      solPrice: state.solPriceUsd,
    },
    
    budget: {
      totalCallsFundable: state.totalApiCallsBudget,
      dailyCallsBudget: state.dailyApiCallsBudget,
      runwayDays: state.currentRunwayDays === Infinity ? 'infinite' : state.currentRunwayDays.toFixed(1),
      healthStatus: state.healthStatus,
      rateMultiplier: state.currentMultiplier,
    },
    
    activity: {
      dailyCallsUsed: state.dailyCallsUsed,
      activeKeys: state.activeKeys,
      dailySpendUsd: dailySpendUsd.toFixed(2),
    },
    
    inflows: {
      last24hSol: dailyInflowSol.toFixed(4),
      last24hUsd: dailyInflowUsd.toFixed(2),
      transactionCount: recentInflows.length,
    },
    
    netPosition: {
      dailyNetUsd: netDailyUsd.toFixed(2),
      sustainable: netDailyUsd >= 0,
    },
    
    uptime: {
      startedAt: new Date(state.startedAt).toISOString(),
      uptimeHours: ((Date.now() - state.startedAt) / (60 * 60 * 1000)).toFixed(1),
      adjustmentsMade: state.adjustmentHistory.length,
    },
  };
  
  state.lastReport = Date.now();
  return report;
}

// ─── Pretty Report (for logging / OpenClaw response) ────────

function formatReport(report) {
  const r = report;
  return `
╔══════════════════════════════════════════════╗
║  ∞  INFINITE Treasury Report                 ║
╠══════════════════════════════════════════════╣
║                                              ║
║  TREASURY                                    ║
║  Balance:  ${String(r.treasury.balanceSol.toFixed(2) + ' SOL').padEnd(20)} ($${r.treasury.balanceUsd.toFixed(2).padStart(10)})  ║
║  SOL/USD:  $${String(r.treasury.solPrice.toFixed(2)).padEnd(33)}  ║
║                                              ║
║  BUDGET                                      ║
║  Fundable: ${String(r.budget.totalCallsFundable.toLocaleString() + ' calls').padEnd(33)}  ║
║  Daily:    ${String(r.budget.dailyCallsBudget.toLocaleString() + ' calls/day').padEnd(33)}  ║
║  Runway:   ${String(r.budget.runwayDays + ' days').padEnd(33)}  ║
║  Status:   ${String(r.budget.healthStatus.toUpperCase()).padEnd(33)}  ║
║  Limiter:  ${String(r.budget.rateMultiplier + 'x').padEnd(33)}  ║
║                                              ║
║  ACTIVITY (24h)                              ║
║  Calls:    ${String(r.activity.dailyCallsUsed.toLocaleString()).padEnd(33)}  ║
║  Keys:     ${String(r.activity.activeKeys).padEnd(33)}  ║
║  Spend:    ${String('$' + r.activity.dailySpendUsd).padEnd(33)}  ║
║                                              ║
║  INFLOWS (24h)                               ║
║  Received: ${String(r.inflows.last24hSol + ' SOL').padEnd(20)} ($${String(r.inflows.last24hUsd).padStart(10)})  ║
║  Txns:     ${String(r.inflows.transactionCount).padEnd(33)}  ║
║                                              ║
║  NET: $${String(r.netPosition.dailyNetUsd + '/day').padEnd(10)} ${r.netPosition.sustainable ? '✓ SUSTAINABLE' : '⚠ BURNING'}       ║
║                                              ║
╚══════════════════════════════════════════════╝
`.trim();
}

// ─── OpenClaw Skill Interface ───────────────────────────────
// These functions are exposed to OpenClaw as callable skills.

export const skills = {
  'treasury-monitor': {
    description: 'Check current treasury balance and health status',
    handler: async () => {
      await checkTreasuryBalance();
      return {
        balanceSol: state.treasuryBalanceSol,
        balanceUsd: state.treasuryBalanceUsd,
        healthStatus: state.healthStatus,
        runwayDays: state.currentRunwayDays,
        multiplier: state.currentMultiplier,
      };
    },
  },
  
  'budget-manager': {
    description: 'Get current API budget breakdown',
    handler: async () => {
      return {
        totalCallsFundable: state.totalApiCallsBudget,
        dailyBudget: state.dailyApiCallsBudget,
        costPerCall: CONFIG.COST_PER_CALL_USD,
        runwayDays: state.currentRunwayDays,
      };
    },
  },
  
  'rate-limit-adjuster': {
    description: 'Force a rate limit recalculation and push to proxy',
    handler: async () => {
      await checkTreasuryBalance();
      await pushRateLimits();
      return {
        multiplier: state.currentMultiplier,
        healthStatus: state.healthStatus,
        pushed: true,
      };
    },
  },
  
  'treasury-report': {
    description: 'Generate a full treasury health report',
    handler: async () => {
      await checkTreasuryBalance();
      await fetchProxyStats();
      const report = generateReport();
      console.log(formatReport(report));
      return report;
    },
  },
};

// ─── Standalone Runner ──────────────────────────────────────
// If not loaded as an OpenClaw skill, runs as a daemon.

async function startDaemon() {
  console.log(`
╔══════════════════════════════════════════════╗
║  ∞  INFINITE Treasury Agent                  ║
║  Monitoring: ${(CONFIG.TREASURY_WALLET || 'NOT SET').slice(0, 8)}...                     ║
║  Proxy:      ${CONFIG.PROXY_ADMIN_URL.padEnd(30)}║
╚══════════════════════════════════════════════╝
  `);
  
  // Initial checks
  await updateSolPrice();
  await checkTreasuryBalance();
  await fetchProxyStats();
  
  // Generate initial report
  const report = generateReport();
  console.log(formatReport(report));
  
  // Schedule recurring checks
  setInterval(checkTreasuryBalance, CONFIG.BALANCE_CHECK_INTERVAL_MS);
  setInterval(updateSolPrice, CONFIG.PRICE_UPDATE_INTERVAL_MS);
  setInterval(fetchProxyStats, CONFIG.BALANCE_CHECK_INTERVAL_MS);
  
  // Hourly report
  setInterval(async () => {
    await checkTreasuryBalance();
    await fetchProxyStats();
    const report = generateReport();
    console.log(formatReport(report));
  }, CONFIG.REPORT_INTERVAL_MS);
}

// ─── HTTP Health Endpoint ───────────────────────────────────
// Optional: run alongside the agent for dashboard polling

async function startHealthServer(port = 3002) {
  const { createServer } = await import('http');
  
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    if (req.url === '/health') {
      res.end(JSON.stringify({ status: 'ok', agent: 'infinite-treasury' }));
    }
    else if (req.url === '/treasury') {
      res.end(JSON.stringify({
        balance: { sol: state.treasuryBalanceSol, usd: state.treasuryBalanceUsd },
        solPrice: state.solPriceUsd,
        budget: { total: state.totalApiCallsBudget, daily: state.dailyApiCallsBudget },
        runway: state.currentRunwayDays,
        health: state.healthStatus,
        multiplier: state.currentMultiplier,
        lastChecked: state.lastBalanceCheck,
      }));
    }
    else if (req.url === '/report') {
      await fetchProxyStats();
      const report = generateReport();
      res.end(JSON.stringify(report));
    }
    else if (req.url === '/history/balance') {
      // Last 24h of balance snapshots
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      res.end(JSON.stringify(state.balanceHistory.filter(h => h.timestamp > oneDayAgo)));
    }
    else if (req.url === '/history/inflows') {
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      res.end(JSON.stringify(state.inflowHistory.filter(h => h.timestamp > oneDayAgo)));
    }
    else if (req.url === '/history/adjustments') {
      res.end(JSON.stringify(state.adjustmentHistory));
    }
    else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not_found' }));
    }
  });
  
  server.listen(port, () => {
    console.log(`[Treasury] Health server on :${port} — /treasury, /report, /history/*`);
  });
}

// ─── Entry Point ────────────────────────────────────────────

const isDirectRun = process.argv[1]?.includes('index') || process.argv[1]?.includes('treasury');

if (isDirectRun) {
  startDaemon();
  startHealthServer(parseInt(process.env.AGENT_PORT || '3002'));
}

export default { skills, state, generateReport, formatReport };
