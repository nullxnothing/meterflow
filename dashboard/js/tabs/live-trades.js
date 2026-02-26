// ═══════════════════════════════════════════
// INFINITE Dashboard - Tab: Live Trades
// ═══════════════════════════════════════════

import { LIVE_TRADES, API_BASE } from '../state.js';

const MAX_TRADES = 100;
const WHALE_THRESHOLD_SOL = 1;
const POLL_INTERVAL = 5_000;

// Track seen signatures to avoid duplicates
const seenSignatures = new Set();

// ─── Polling ───

export function startLiveTrades() {
  if (LIVE_TRADES.pollInterval) return;

  updateConnectionStatus('connecting');
  fetchTrades(); // immediate first fetch
  LIVE_TRADES.pollInterval = setInterval(fetchTrades, POLL_INTERVAL);
}

export function stopLiveTrades() {
  if (LIVE_TRADES.pollInterval) {
    clearInterval(LIVE_TRADES.pollInterval);
    LIVE_TRADES.pollInterval = null;
  }
}

async function fetchTrades() {
  try {
    const res = await fetch(`${API_BASE}/v1/trades/live`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    updateConnectionStatus('connected');

    if (!data.trades?.length) return;

    let hasNew = false;
    for (const trade of data.trades) {
      if (seenSignatures.has(trade.signature)) continue;
      seenSignatures.add(trade.signature);
      hasNew = true;
      processTrade(trade);
    }

    // Cap seen set
    if (seenSignatures.size > 500) {
      const arr = [...seenSignatures];
      seenSignatures.clear();
      arr.slice(-200).forEach(s => seenSignatures.add(s));
    }

    if (!hasNew && LIVE_TRADES.trades.length === 0) {
      // First load — populate from API response even if "seen"
      for (const trade of data.trades.reverse()) {
        processTrade(trade);
        seenSignatures.add(trade.signature);
      }
    }
  } catch {
    updateConnectionStatus('disconnected');
  }
}

// ─── Trade Processing ───

function processTrade(trade) {
  const solAmount = Number(trade.solAmount || 0);
  const tokenAmount = Number(trade.tokenAmount || 0);
  const isBuy = trade.txType === 'buy';
  const isWhale = solAmount >= WHALE_THRESHOLD_SOL;

  const entry = {
    type: trade.txType,
    sol: solAmount,
    tokens: tokenAmount,
    wallet: trade.traderPublicKey || '',
    signature: trade.signature || '',
    timestamp: trade.timestamp || Date.now(),
    isWhale,
  };

  // Avoid dupes in state
  if (LIVE_TRADES.trades.some(t => t.signature === entry.signature)) return;

  LIVE_TRADES.trades.unshift(entry);
  if (LIVE_TRADES.trades.length > MAX_TRADES) LIVE_TRADES.trades.pop();

  // Update running stats
  LIVE_TRADES.stats.volumeSol += solAmount;
  if (isBuy) LIVE_TRADES.stats.buys++;
  else LIVE_TRADES.stats.sells++;
  if (isWhale) LIVE_TRADES.stats.whales++;

  // DOM updates
  prependTradeRow(entry);
  updateStatsDisplay();

  if (isWhale) showWhaleAlert(entry);
}

// ─── DOM Updates (incremental) ───

function prependTradeRow(entry) {
  const feed = document.getElementById('tradeFeed');
  if (!feed) return;

  const empty = feed.querySelector('.feed-empty');
  if (empty) empty.remove();

  const row = document.createElement('div');
  row.className = `trade-row ${entry.type}${entry.isWhale ? ' whale' : ''}`;

  const shortWallet = entry.wallet
    ? entry.wallet.slice(0, 4) + '...' + entry.wallet.slice(-4)
    : '???';
  const time = new Date(entry.timestamp).toLocaleTimeString();
  const typeLabel = entry.type === 'buy' ? '+ BUY' : '- SELL';

  row.innerHTML = `
    <span class="trade-type-badge">${typeLabel}</span>
    <span class="trade-sol">${entry.sol.toFixed(4)} SOL</span>
    <span class="trade-tokens">${entry.tokens.toLocaleString(undefined, { maximumFractionDigits: 0 })} INF</span>
    <a class="trade-wallet" href="https://solscan.io/account/${entry.wallet}" target="_blank" rel="noopener">${shortWallet}</a>
    <span class="trade-time">${time}</span>
    ${entry.signature ? `<a class="trade-tx" href="https://solscan.io/tx/${entry.signature}" target="_blank" rel="noopener" title="View transaction">TX</a>` : ''}
  `;

  feed.prepend(row);

  while (feed.children.length > MAX_TRADES) {
    feed.removeChild(feed.lastChild);
  }
}

function updateStatsDisplay() {
  const { buys, sells, volumeSol, whales } = LIVE_TRADES.stats;

  const buyEl = document.getElementById('statBuys');
  const sellEl = document.getElementById('statSells');
  const volEl = document.getElementById('statVolume');
  const whaleEl = document.getElementById('statWhales');
  const ratioEl = document.getElementById('statRatio');

  if (buyEl) buyEl.textContent = buys;
  if (sellEl) sellEl.textContent = sells;
  if (volEl) volEl.textContent = volumeSol.toFixed(2);
  if (whaleEl) whaleEl.textContent = whales;

  if (ratioEl) {
    const total = buys + sells;
    const buyPct = total > 0 ? Math.round((buys / total) * 100) : 50;
    ratioEl.style.setProperty('--buy-pct', `${buyPct}%`);
    ratioEl.querySelector('.ratio-label').textContent = `${buyPct}% buy`;
  }
}

function updateConnectionStatus(status) {
  const dot = document.getElementById('feedStatusDot');
  const label = document.getElementById('feedStatusLabel');
  if (dot) dot.className = `feed-status-dot ${status}`;
  if (label) {
    const labels = { connected: 'LIVE', disconnected: 'OFFLINE', connecting: 'CONNECTING' };
    label.textContent = labels[status] || status;
  }
}

function showWhaleAlert(entry) {
  const container = document.querySelector('.live-trades-container');
  if (!container) return;

  const alert = document.createElement('div');
  alert.className = 'whale-alert';
  const typeLabel = entry.type === 'buy' ? 'BUY' : 'SELL';
  alert.textContent = `WHALE ${typeLabel}: ${entry.sol.toFixed(2)} SOL`;
  container.prepend(alert);
  setTimeout(() => alert.remove(), 4000);
}

// ─── Render ───

export function renderLiveTrades() {
  const { stats, trades } = LIVE_TRADES;

  // Kick off polling on render
  setTimeout(startLiveTrades, 0);

  return `
    <div class="live-trades-container">
      <div class="page-header">
        <div class="page-header-row">
          <div>
            <h1 class="page-title">Live Trades</h1>
            <p class="page-sub">Real-time $INFINITE token activity</p>
          </div>
          <div class="feed-status">
            <span class="feed-status-dot disconnected" id="feedStatusDot"></span>
            <span class="feed-status-label" id="feedStatusLabel">CONNECTING</span>
          </div>
        </div>
      </div>

      <div class="trade-stats-row">
        <div class="stat-card">
          <div class="label">Buys</div>
          <div class="value green" id="statBuys">${stats.buys}</div>
        </div>
        <div class="stat-card">
          <div class="label">Sells</div>
          <div class="value red" id="statSells">${stats.sells}</div>
        </div>
        <div class="stat-card">
          <div class="label">Volume</div>
          <div class="value" id="statVolume">${stats.volumeSol.toFixed(2)}</div>
          <div class="sub">SOL</div>
        </div>
        <div class="stat-card">
          <div class="label">Whales</div>
          <div class="value accent" id="statWhales">${stats.whales}</div>
          <div class="sub">&gt;${WHALE_THRESHOLD_SOL} SOL</div>
        </div>
      </div>

      <div class="trade-ratio-bar" id="statRatio" style="--buy-pct: 50%;">
        <div class="ratio-fill"></div>
        <span class="ratio-label">--</span>
      </div>

      <div class="trade-feed-header">
        <span>Type</span>
        <span>Amount</span>
        <span>Tokens</span>
        <span>Wallet</span>
        <span>Time</span>
        <span></span>
      </div>

      <div class="trade-feed" id="tradeFeed">
        ${trades.length > 0
          ? trades.map(t => {
              const shortWallet = t.wallet ? t.wallet.slice(0, 4) + '...' + t.wallet.slice(-4) : '???';
              const time = new Date(t.timestamp).toLocaleTimeString();
              const typeLabel = t.type === 'buy' ? '+ BUY' : '- SELL';
              return `
                <div class="trade-row ${t.type}${t.isWhale ? ' whale' : ''}">
                  <span class="trade-type-badge">${typeLabel}</span>
                  <span class="trade-sol">${t.sol.toFixed(4)} SOL</span>
                  <span class="trade-tokens">${t.tokens.toLocaleString(undefined, { maximumFractionDigits: 0 })} INF</span>
                  <a class="trade-wallet" href="https://solscan.io/account/${t.wallet}" target="_blank" rel="noopener">${shortWallet}</a>
                  <span class="trade-time">${time}</span>
                  ${t.signature ? `<a class="trade-tx" href="https://solscan.io/tx/${t.signature}" target="_blank" rel="noopener">TX</a>` : ''}
                </div>`;
            }).join('')
          : '<div class="feed-empty">Waiting for trades...</div>'
        }
      </div>
    </div>
  `;
}
