// ═══════════════════════════════════════════
// INFINITE Dashboard - Tab: Trading Bot
// ═══════════════════════════════════════════

import { STATE, TRADING } from '../state.js';
import { api, API_BASE, escapeHtml } from '../api.js';
import { renderMarkdown } from '../markdown.js';
import { bindCodeCopyButtons } from '../tools.js';
import { showToast, setTab, copyText } from '../actions.js';
import { render } from '../render.js';

// ─── Conversation Management ───

export function getActiveTradingConversation() {
  if (!TRADING.activeId) {
    const conv = { id: 'tconv_' + Date.now(), messages: [] };
    TRADING.conversations.push(conv);
    TRADING.activeId = conv.id;
  }
  return TRADING.conversations.find(c => c.id === TRADING.activeId);
}

// ─── Trading State Fetching ───

export async function initTradingWallet() {
  try {
    const res = await api('/v1/trading/wallet/create', { method: 'POST' });
    TRADING.wallet = { publicKey: res.publicKey, solBalance: 0 };
    await fetchTradingState();
    render();
  } catch (err) {
    console.error('Wallet creation failed:', err.message);
  }
}

export async function fetchTradingState() {
  if (STATE.activeTab !== 'trading') return;
  if (TRADING._endpointsDead) return;

  try {
    const walletInfo = await api('/v1/trading/wallet/info');
    TRADING.wallet = { publicKey: walletInfo.publicKey, solBalance: walletInfo.solBalance };
    TRADING.positions = walletInfo.positions || [];
    TRADING._fetchFailCount = 0;
  } catch (err) {
    TRADING._fetchFailCount = (TRADING._fetchFailCount || 0) + 1;
    if (err.status === 404) { TRADING.wallet = null; return; }
    if (err.status === 403 || err.status === 502 || err.status === 500 || err.status === 0) {
      TRADING._endpointsDead = true; stopBotPolling(); return;
    }
    if (TRADING._fetchFailCount >= 2) { TRADING._endpointsDead = true; stopBotPolling(); return; }
    return;
  }

  try {
    const results = await Promise.allSettled([
      api('/v1/trading/portfolio'),
      api('/v1/trading/dca/orders'),
      api('/v1/trading/copy/targets'),
      api('/v1/trading/trigger/list'),
      api('/v1/trading/safety/status'),
      api('/v1/trading/history?limit=50'),
    ]);
    if (results[0].status === 'fulfilled') TRADING.portfolio = results[0].value || null;
    if (results[1].status === 'fulfilled') TRADING.dcaOrders = results[1].value || [];
    if (results[2].status === 'fulfilled') TRADING.copyTargets = results[2].value?.targets || [];
    if (results[3].status === 'fulfilled') TRADING.triggers = results[3].value || [];
    if (results[4].status === 'fulfilled') TRADING.safety = results[4].value || null;
    if (results[5].status === 'fulfilled') TRADING.history = results[5].value || [];
  } catch {}
}

// ─── Polling Control ───

export function startBotPolling() {
  if (TRADING.pollInterval || TRADING._endpointsDead) return;
  TRADING._fetchFailCount = 0;
  fetchTradingState().then(() => {
    if (TRADING.pollInterval || TRADING._endpointsDead) return;
    TRADING.pollInterval = setInterval(async () => {
      await fetchTradingState();
      if (STATE.activeTab === 'trading') renderBotPanelContent();
    }, 15000);
  });
}

export function stopBotPolling() {
  if (TRADING.pollInterval) { clearInterval(TRADING.pollInterval); TRADING.pollInterval = null; }
}

export function setBotPanel(panel) {
  TRADING.activePanel = panel;
  renderBotPanelContent();
}

// ─── Panel Rendering ───

export function renderBotPanelContent() {
  const main = document.getElementById('botMainPanel');
  if (!main) return;
  switch (TRADING.activePanel) {
    case 'portfolio': main.innerHTML = renderBotPortfolio(); break;
    case 'overview': main.innerHTML = renderBotOverview(); break;
    case 'swap': main.innerHTML = renderBotSwap(); break;
    case 'dca': main.innerHTML = renderBotDCA(); break;
    case 'copy': main.innerHTML = renderBotCopy(); break;
    case 'triggers': main.innerHTML = renderBotTriggers(); break;
    case 'history': main.innerHTML = renderBotHistory(); break;
  }
  document.querySelectorAll('.bot-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.panel === TRADING.activePanel);
  });
}

export function renderTrading() {
  const isTradingTier = STATE.tier === 'Operator' || STATE.tier === 'Architect';

  if (!isTradingTier) {
    return `<div class="bot-empty"><div class="bot-empty-icon">/</div><div>Trade Bot requires <strong>Operator</strong> tier or above.</div><div style="margin-top:8px;font-size:10px;color:var(--text-muted);">Hold 100K+ $INFINITE tokens to unlock.</div></div>`;
  }

  setTimeout(() => startBotPolling(), 50);

  const w = TRADING.wallet;
  const safety = TRADING.safety;
  const pnl = safety?.dailyPnlSol || 0;
  const pnlClass = pnl >= 0 ? 'positive' : 'negative';
  const pnlStr = (pnl >= 0 ? '+' : '') + pnl.toFixed(4);
  const isKilled = safety?.isKilled || safety?.isCooldown;
  const dcaActive = TRADING.dcaOrders.filter(d => d.status === 'active').length;
  const copyActive = TRADING.copyTargets.filter(t => !t.isPaused).length;
  const trigActive = TRADING.triggers.filter(t => t.status === 'active').length;

  return `
    <div class="bot-layout">
      <div class="bot-sidebar">
        ${w ? `
          <div class="bot-card">
            <div class="bot-card-title">Wallet</div>
            <div class="bot-wallet-addr" onclick="copyText('${w.publicKey}')" title="Click to copy address" style="cursor:pointer;">
              ${w.publicKey.slice(0, 6)}...${w.publicKey.slice(-4)}
              <span style="color:var(--accent);font-size:9px;margin-left:4px;">COPY</span>
            </div>
            <div class="bot-wallet-bal">${(w.solBalance || 0).toFixed(4)} SOL</div>
            <div class="bot-wallet-bal-label">Available Balance</div>
            <div class="bot-wallet-actions">
              <button class="bot-wallet-action-btn" onclick="copyText('${w.publicKey}')">Copy Address</button>
              <button class="bot-wallet-action-btn" onclick="exportBotPrivateKey()">Export Key</button>
            </div>
          </div>
        ` : `
          <div class="bot-card">
            <div class="bot-card-title">Wallet</div>
            <div style="text-align:center;padding:12px 0;">
              <button class="bot-form-submit" onclick="initTradingWallet()" style="font-size:10px;padding:10px 16px;">Create Burner Wallet</button>
            </div>
          </div>
        `}

        ${w ? `
          <div class="bot-card">
            <div class="bot-card-title">Quick Trade</div>
            <div class="bot-quick-trade">
              <input class="bot-input" id="botQtToken" placeholder="Token address">
              <input class="bot-input" id="botQtAmount" placeholder="SOL amount" type="number" step="0.01">
              <div class="bot-trade-btns">
                <button class="bot-btn-buy" onclick="executeQuickTrade('buy')">BUY</button>
                <button class="bot-btn-sell" onclick="executeQuickTrade('sell')">SELL</button>
              </div>
            </div>
          </div>
        ` : ''}

        <div class="bot-card">
          <div class="bot-card-title">Panels</div>
          <div class="bot-nav-list">
            <div class="bot-nav-item ${TRADING.activePanel === 'portfolio' ? 'active' : ''}" data-panel="portfolio" onclick="setBotPanel('portfolio')">Portfolio</div>
            <div class="bot-nav-item ${TRADING.activePanel === 'overview' ? 'active' : ''}" data-panel="overview" onclick="setBotPanel('overview')">Positions</div>
            <div class="bot-nav-item ${TRADING.activePanel === 'swap' ? 'active' : ''}" data-panel="swap" onclick="setBotPanel('swap')">Swap</div>
            <div class="bot-nav-item ${TRADING.activePanel === 'dca' ? 'active' : ''}" data-panel="dca" onclick="setBotPanel('dca')">DCA <span class="bot-nav-count">${dcaActive}</span></div>
            <div class="bot-nav-item ${TRADING.activePanel === 'copy' ? 'active' : ''}" data-panel="copy" onclick="setBotPanel('copy')">Copy Trade <span class="bot-nav-count">${copyActive}</span></div>
            <div class="bot-nav-item ${TRADING.activePanel === 'triggers' ? 'active' : ''}" data-panel="triggers" onclick="setBotPanel('triggers')">Triggers <span class="bot-nav-count">${trigActive}</span></div>
            <div class="bot-nav-item ${TRADING.activePanel === 'history' ? 'active' : ''}" data-panel="history" onclick="setBotPanel('history')">History</div>
          </div>
        </div>

        <div class="bot-card">
          <div class="bot-card-title">Safety <span class="badge ${isKilled ? 'badge-stopped' : 'badge-live'}">${isKilled ? 'STOPPED' : 'ACTIVE'}</span></div>
          <div class="bot-pnl ${pnlClass}">PnL: ${pnlStr} SOL</div>
          <div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);margin-bottom:10px;">Trades today: ${safety?.dailyTrades || 0}</div>
          ${isKilled
            ? `<button class="bot-resume-btn" onclick="botResume()">RESUME TRADING</button>`
            : `<button class="bot-kill-btn" onclick="botKill()">KILL SWITCH</button>`
          }
        </div>
      </div>
      <div class="bot-main" id="botMainPanel">
        ${renderBotPortfolio()}
      </div>
    </div>
  `;
}

// ─── Sub-panel Renderers ───

function formatCompact(num) {
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toFixed(0);
}

function formatTokenPrice(price) {
  if (price < 0.0001) return price.toExponential(2);
  if (price < 1) return price.toFixed(6);
  if (price < 100) return price.toFixed(4);
  return price.toFixed(2);
}

function renderBotPortfolio() {
  const p = TRADING.portfolio;
  if (!p) return `<div><div class="bot-empty"><div class="bot-empty-icon">/</div>Loading portfolio...</div></div>`;

  const sol = p.solBalance || 0;
  const solUsd = p.solValueUsd || 0;
  const totalUsd = p.totalValueUsd || 0;
  const holdings = p.holdings || [];
  const solPrice = p.solPriceUsd || 0;

  return `<div>
    <h2>Portfolio</h2>
    <div class="portfolio-summary">
      <div class="portfolio-stat-card"><div class="label">Total Value</div><div class="val accent">$${totalUsd.toFixed(2)}</div></div>
      <div class="portfolio-stat-card"><div class="label">SOL Balance</div><div class="val">${sol.toFixed(4)}</div></div>
      <div class="portfolio-stat-card"><div class="label">Tokens Held</div><div class="val">${holdings.length}</div></div>
      <div class="portfolio-stat-card"><div class="label">SOL Price</div><div class="val">$${solPrice.toFixed(2)}</div></div>
    </div>
    <h2>Holdings</h2>
    <div class="portfolio-holdings">
      <div class="portfolio-sol-row">
        <div><div style="font-weight:600;">SOL</div><div class="token-mint">Native</div></div>
        <div class="token-amount">${sol.toFixed(4)}</div>
        <div class="token-value">$${solUsd.toFixed(2)}</div>
      </div>
      ${holdings.length === 0 ? '<div class="bot-empty" style="padding:24px 0;">No token holdings</div>' : holdings.map(h => `
        <div class="portfolio-row" onclick="copyText('${h.mint}')" title="Click to copy mint">
          <div><div>${h.mint.slice(0, 4)}...${h.mint.slice(-4)}</div><div class="token-mint">${h.mint}</div></div>
          <div class="token-amount">${formatCompact(h.amount)}</div>
          <div class="token-value">${h.valueUsd > 0 ? '$' + h.valueUsd.toFixed(2) : '—'}</div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function renderBotOverview() {
  const positions = TRADING.positions || [];
  return `<div>
    <h2>Positions (${positions.length})</h2>
    ${positions.length === 0
      ? '<div class="bot-empty"><div class="bot-empty-icon">/</div>No open positions</div>'
      : `<div class="bot-positions-grid">${positions.map(p => `
        <div class="bot-position-card">
          <div class="bot-position-token">${p.mint?.slice(0, 8) || 'Unknown'}...</div>
          <div class="bot-position-mint">${p.mint || '—'}</div>
          <div class="bot-position-stats">
            <div class="bot-position-stat"><div class="label">Amount</div><div class="val">${formatCompact(p.amount || 0)}</div></div>
            <div class="bot-position-stat"><div class="label">Avg Price</div><div class="val">${p.avgPrice ? formatTokenPrice(p.avgPrice) : '—'}</div></div>
          </div>
        </div>`).join('')}</div>`
    }
    <h2 style="margin-top:24px;">Recent Trades</h2>
    ${renderBotHistoryTable(TRADING.history.slice(-10))}
  </div>`;
}

function renderBotSwap() {
  return `<div>
    <h2>Jupiter Swap</h2>
    <div class="bot-form">
      <div class="bot-form-row"><label class="bot-form-label">Input Mint</label><input class="bot-form-input" id="swapInputMint" value="So11111111111111111111111111111111111111112" placeholder="SOL mint"></div>
      <div class="bot-form-row"><label class="bot-form-label">Output Mint</label><input class="bot-form-input" id="swapOutputMint" placeholder="Token mint address"></div>
      <div class="bot-form-row"><label class="bot-form-label">Amount (lamports)</label><input class="bot-form-input" id="swapAmount" type="number" placeholder="e.g. 100000000 = 0.1 SOL"></div>
      <div class="bot-form-row"><label class="bot-form-label">Slippage (bps)</label><input class="bot-form-input" id="swapSlippage" type="number" value="300" placeholder="300 = 3%"></div>
      <button class="bot-form-submit" onclick="executeSwapForm()">Execute Swap</button>
      <div id="swapResult" style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);"></div>
    </div>
  </div>`;
}

function renderBotDCA() {
  const orders = TRADING.dcaOrders || [];
  return `<div>
    <h2>DCA Orders</h2>
    <div class="bot-form" style="margin-bottom:24px;">
      <div class="bot-form-row"><label class="bot-form-label">Input Mint (from)</label><input class="bot-form-input" id="dcaInputMint" value="So11111111111111111111111111111111111111112"></div>
      <div class="bot-form-row"><label class="bot-form-label">Output Mint (to)</label><input class="bot-form-input" id="dcaOutputMint" placeholder="Token mint"></div>
      <div class="bot-form-row"><label class="bot-form-label">Total Amount (lamports)</label><input class="bot-form-input" id="dcaTotal" type="number" placeholder="e.g. 500000000 = 0.5 SOL"></div>
      <div class="bot-form-row"><label class="bot-form-label">Per Cycle (lamports)</label><input class="bot-form-input" id="dcaPerCycle" type="number" placeholder="e.g. 100000000 = 0.1 SOL"></div>
      <div class="bot-form-row"><label class="bot-form-label">Interval (seconds)</label><input class="bot-form-input" id="dcaInterval" type="number" value="3600" placeholder="3600 = 1 hour"></div>
      <button class="bot-form-submit" onclick="createDCA()">Create DCA Order</button>
    </div>
    <h2>Active Orders (${orders.length})</h2>
    <div class="bot-list">
      ${orders.length === 0 ? '<div class="bot-empty">No DCA orders</div>' : orders.map(o => `
        <div class="bot-list-item">
          <div>
            <div class="bot-list-info">${o.inputMint?.slice(0, 6)}... → ${o.outputMint?.slice(0, 6)}...</div>
            <div class="bot-list-sub">${o.cyclesCompleted}/${o.maxCycles} cycles | ${o.status}</div>
          </div>
          ${o.status === 'active' || o.status === 'paused' ? `<button class="bot-list-action" onclick="cancelDCA('${o.id}')">Cancel</button>` : ''}
        </div>
      `).join('')}
    </div>
  </div>`;
}

function renderBotCopy() {
  const targets = TRADING.copyTargets || [];
  return `<div>
    <h2>Copy Trading</h2>
    <div class="bot-form" style="margin-bottom:24px;">
      <div class="bot-form-row"><label class="bot-form-label">Wallet Address to Follow</label><input class="bot-form-input" id="copyAddress" placeholder="Solana wallet address"></div>
      <div class="bot-form-row"><label class="bot-form-label">Max Position (SOL)</label><input class="bot-form-input" id="copyMaxSol" type="number" value="0.5" step="0.1"></div>
      <div class="bot-form-row"><label class="bot-form-label">Multiplier</label><input class="bot-form-input" id="copyMultiplier" type="number" value="1.0" step="0.1"></div>
      <button class="bot-form-submit" onclick="followWallet()">Follow Wallet</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px;">
      <button class="bot-form-submit" onclick="startCopyTrading()" style="flex:1;background:var(--green);font-size:10px;padding:8px;">Start Monitoring</button>
      <button class="bot-form-submit" onclick="stopCopyTrading()" style="flex:1;background:var(--red);font-size:10px;padding:8px;">Stop</button>
    </div>
    <h2>Followed Wallets (${targets.length})</h2>
    <div class="bot-list">
      ${targets.length === 0 ? '<div class="bot-empty">No wallets followed</div>' : targets.map(t => `
        <div class="bot-list-item">
          <div>
            <div class="bot-list-info">${t.name || t.address?.slice(0, 8)}...</div>
            <div class="bot-list-sub">${t.tradesCopied || 0} trades copied | ${t.isPaused ? 'Paused' : 'Active'}</div>
          </div>
          <button class="bot-list-action" onclick="unfollowWallet('${t.id}')">Remove</button>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function renderBotTriggers() {
  const triggers = TRADING.triggers || [];
  return `<div>
    <h2>Conditional Orders (TP / SL / Sniper)</h2>
    <div class="bot-form" style="margin-bottom:24px;">
      <div class="bot-form-row"><label class="bot-form-label">Token Mint</label><input class="bot-form-input" id="trigMint" placeholder="Token mint"></div>
      <div class="bot-form-row"><label class="bot-form-label">Condition Type</label>
        <select class="bot-form-input" id="trigCondType"><option value="price_above">Price Above (TP)</option><option value="price_below">Price Below (SL)</option><option value="price_cross">Price Cross</option></select>
      </div>
      <div class="bot-form-row"><label class="bot-form-label">Target Price (USD)</label><input class="bot-form-input" id="trigPrice" type="number" step="any"></div>
      <div class="bot-form-row"><label class="bot-form-label">Action</label>
        <select class="bot-form-input" id="trigAction"><option value="sell">Sell</option><option value="buy">Buy</option></select>
      </div>
      <div class="bot-form-row"><label class="bot-form-label">Amount (lamports)</label><input class="bot-form-input" id="trigAmount" type="number"></div>
      <button class="bot-form-submit" onclick="createTrigger()">Create Trigger</button>
    </div>
    <h2>Active Triggers (${triggers.filter(t => t.status === 'active').length})</h2>
    <div class="bot-list">
      ${triggers.length === 0 ? '<div class="bot-empty">No triggers set</div>' : triggers.map(t => `
        <div class="bot-list-item">
          <div>
            <div class="bot-list-info">${t.condition?.type} @ $${t.condition?.price || '?'}</div>
            <div class="bot-list-sub">${t.mint?.slice(0, 8)}... | ${t.status}</div>
          </div>
          ${t.status === 'active' ? `<button class="bot-list-action" onclick="cancelTrigger('${t.id}')">Cancel</button>` : ''}
        </div>
      `).join('')}
    </div>
  </div>`;
}

function renderBotHistory() {
  return `<div>
    <h2>Trade History</h2>
    ${renderBotHistoryTable(TRADING.history)}
  </div>`;
}

function renderBotHistoryTable(entries) {
  if (!entries || entries.length === 0) return '<div class="bot-empty">No trades yet</div>';
  return `
    <table class="bot-history-table">
      <thead><tr><th>Time</th><th>Action</th><th>Token</th><th>Signature</th></tr></thead>
      <tbody>
        ${entries.slice().reverse().map(t => `
          <tr>
            <td>${new Date(t.ts).toLocaleTimeString()}</td>
            <td>${t.action || '—'}</td>
            <td>${t.mint ? t.mint.slice(0, 8) + '...' : t.inputMint ? t.inputMint.slice(0, 6) + '→' + (t.outputMint||'').slice(0, 6) : '—'}</td>
            <td>${t.sig ? '<a href="https://solscan.io/tx/' + t.sig + '" target="_blank" style="color:var(--accent);">' + t.sig.slice(0, 8) + '...</a>' : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ─── Bot Actions ───

export async function exportBotPrivateKey() {
  if (!confirm('This will display your private key. Never share it with anyone. Continue?')) return;
  try {
    const res = await api('/v1/trading/wallet/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });
    const key = res.privateKey || res.secretKey || '';
    if (key) {
      await navigator.clipboard.writeText(key);
      alert('Private key copied to clipboard.');
    } else {
      alert('Could not retrieve private key.');
    }
  } catch (err) {
    alert('Export failed: ' + (err.message || 'Unknown error'));
  }
}

export async function executeQuickTrade(action) {
  const token = document.getElementById('botQtToken')?.value.trim();
  const amount = parseFloat(document.getElementById('botQtAmount')?.value);
  if (!token || !amount || amount <= 0) return;
  try {
    await api(`/v1/trading/pump/${action}`, { method: 'POST', body: JSON.stringify({ mint: token, amount, denominatedInSol: true, slippage: 15 }) });
    await fetchTradingState();
    render();
  } catch (err) {
    console.error(`Quick ${action} failed:`, err.message);
  }
}

export async function executeSwapForm() {
  const result = document.getElementById('swapResult');
  const inputMint = document.getElementById('swapInputMint')?.value.trim();
  const outputMint = document.getElementById('swapOutputMint')?.value.trim();
  const amount = document.getElementById('swapAmount')?.value.trim();
  const slippageBps = parseInt(document.getElementById('swapSlippage')?.value) || 300;
  if (!inputMint || !outputMint || !amount) { if (result) result.textContent = 'Fill all fields'; return; }
  if (result) result.textContent = 'Executing...';
  try {
    const res = await api('/v1/trading/swap', { method: 'POST', body: JSON.stringify({ inputMint, outputMint, amount, slippageBps }) });
    if (result) result.innerHTML = 'Success: <a href="https://solscan.io/tx/' + res.signature + '" target="_blank" style="color:var(--accent);">' + res.signature.slice(0, 16) + '...</a>';
    await fetchTradingState();
  } catch (err) {
    if (result) result.textContent = 'Failed: ' + err.message;
  }
}

export async function createDCA() {
  const inputMint = document.getElementById('dcaInputMint')?.value.trim();
  const outputMint = document.getElementById('dcaOutputMint')?.value.trim();
  const total = parseInt(document.getElementById('dcaTotal')?.value);
  const perCycle = parseInt(document.getElementById('dcaPerCycle')?.value);
  const interval = parseInt(document.getElementById('dcaInterval')?.value) * 1000;
  if (!inputMint || !outputMint || !total || !perCycle || !interval) return;
  try {
    await api('/v1/trading/dca/create', { method: 'POST', body: JSON.stringify({ inputMint, outputMint, totalAmountLamports: total, amountPerCycleLamports: perCycle, cycleIntervalMs: interval }) });
    await fetchTradingState();
    renderBotPanelContent();
  } catch (err) {
    console.error('DCA create failed:', err.message);
  }
}

export async function cancelDCA(id) {
  try {
    await api(`/v1/trading/dca/${id}/cancel`, { method: 'POST' });
    await fetchTradingState();
    renderBotPanelContent();
  } catch (err) {
    console.error('DCA cancel failed:', err.message);
  }
}

export async function followWallet() {
  const address = document.getElementById('copyAddress')?.value.trim();
  const maxPositionSol = parseFloat(document.getElementById('copyMaxSol')?.value) || 0.5;
  const multiplier = parseFloat(document.getElementById('copyMultiplier')?.value) || 1.0;
  if (!address) return;
  try {
    await api('/v1/trading/copy/follow', { method: 'POST', body: JSON.stringify({ address, maxPositionSol, multiplier }) });
    await fetchTradingState();
    renderBotPanelContent();
  } catch (err) {
    console.error('Follow failed:', err.message);
  }
}

export async function unfollowWallet(targetId) {
  try {
    await api('/v1/trading/copy/unfollow', { method: 'POST', body: JSON.stringify({ targetId }) });
    await fetchTradingState();
    renderBotPanelContent();
  } catch (err) {
    console.error('Unfollow failed:', err.message);
  }
}

export async function startCopyTrading() {
  try { await api('/v1/trading/copy/start', { method: 'POST' }); } catch (err) { console.error(err.message); }
}

export async function stopCopyTrading() {
  try { await api('/v1/trading/copy/stop', { method: 'POST' }); } catch (err) { console.error(err.message); }
}

export async function createTrigger() {
  const mint = document.getElementById('trigMint')?.value.trim();
  const condType = document.getElementById('trigCondType')?.value;
  const price = parseFloat(document.getElementById('trigPrice')?.value);
  const action = document.getElementById('trigAction')?.value;
  const amount = document.getElementById('trigAmount')?.value;
  if (!mint || !condType || !price || !action || !amount) return;

  const inputMint = action === 'buy' ? 'So11111111111111111111111111111111111111112' : mint;
  const outputMint = action === 'buy' ? mint : 'So11111111111111111111111111111111111111112';

  try {
    await api('/v1/trading/trigger/create', { method: 'POST', body: JSON.stringify({
      mint, condition: { type: condType, price }, order: { action, inputMint, outputMint, amount, slippageBps: 500 }
    })});
    await fetchTradingState();
    renderBotPanelContent();
  } catch (err) {
    console.error('Trigger create failed:', err.message);
  }
}

export async function cancelTrigger(id) {
  try {
    await api(`/v1/trading/trigger/${id}/cancel`, { method: 'POST' });
    await fetchTradingState();
    renderBotPanelContent();
  } catch (err) {
    console.error('Trigger cancel failed:', err.message);
  }
}

export async function botKill() {
  try {
    await api('/v1/trading/safety/kill', { method: 'POST', body: JSON.stringify({ reason: 'Dashboard kill switch' }) });
    await fetchTradingState();
    render();
  } catch (err) {
    console.error('Kill switch failed:', err.message);
  }
}

export async function botResume() {
  try {
    await api('/v1/trading/safety/resume', { method: 'POST' });
    await fetchTradingState();
    render();
  } catch (err) {
    console.error('Resume failed:', err.message);
  }
}

// ─── Token Lookup ───

export async function lookupToken() {
  const input = document.getElementById('chatTokenAddr');
  if (!input) return;
  const address = input.value.trim();
  if (!address) return;

  const card = document.getElementById('tokenInfoCard');
  if (card) card.innerHTML = '<div style="padding:12px;text-align:center;"><div class="image-spinner" style="margin:0 auto;"></div></div>';

  try {
    const info = await api(`/v1/trading/token/${address}`);
    TRADING.tokenInfo = info;
    renderTokenInfoCard(info);
    sendTradingQuery(`Analyze this token in detail: ${info.name || 'Unknown'} (${info.symbol || '?'}) at address ${address}. Give me a full breakdown: risk level, liquidity analysis, price action assessment, and whether it looks like a good opportunity right now.`, address);
  } catch (err) {
    if (card) card.innerHTML = `<div style="padding:12px;color:var(--red);font-family:var(--font-mono);font-size:11px;">Lookup failed: ${escapeHtml(err.message || 'Unknown error')}</div>`;
  }
}

function renderTokenInfoCard(info) {
  const card = document.getElementById('tokenInfoCard');
  if (!card) return;

  const changeClass = (info.change24h || 0) >= 0 ? 'green' : 'red';
  const changePrefix = (info.change24h || 0) >= 0 ? '+' : '';

  card.innerHTML = `
    <div class="token-info-card" style="margin-top:12px;">
      <div class="token-info-header">
        <span class="token-info-name">${escapeHtml(info.name || 'Unknown')}</span>
        <span class="token-info-symbol">$${escapeHtml(info.symbol || '?')}</span>
      </div>
      <div class="token-info-stats">
        <div class="token-info-stat"><div class="label">Price</div><div class="val">${info.price ? '$' + formatTokenPrice(info.price) : '—'}</div></div>
        <div class="token-info-stat"><div class="label">24h</div><div class="val ${changeClass}">${info.change24h !== null ? changePrefix + info.change24h + '%' : '—'}</div></div>
        <div class="token-info-stat"><div class="label">Mkt Cap</div><div class="val">${info.marketCap ? '$' + formatCompact(info.marketCap) : '—'}</div></div>
        <div class="token-info-stat"><div class="label">Liquidity</div><div class="val">${info.liquidity ? '$' + formatCompact(info.liquidity) : '—'}</div></div>
      </div>
    </div>
  `;
}

export function sendTradingQuery(preset, tokenAddress) {
  setTab('chat');
  setTimeout(() => {
    const input = document.getElementById('chatInput');
    if (input && preset) {
      input.value = preset;
      import('../chat.js').then(mod => mod.sendChatMessage());
    }
  }, 100);
}

// ─── Trading Chat ───

export function saveTradingHistory() {
  try {
    const toSave = TRADING.conversations.slice(-10).map(c => ({
      id: c.id,
      messages: c.messages.slice(-50),
    }));
    localStorage.setItem('infinite_trading', JSON.stringify({ conversations: toSave, activeId: TRADING.activeId }));
  } catch {}
}

export function loadTradingHistory() {
  try {
    const raw = localStorage.getItem('infinite_trading');
    if (!raw) return;
    const data = JSON.parse(raw);
    TRADING.conversations = data.conversations || [];
    TRADING.activeId = data.activeId;
  } catch {}
}

// Attach to window for onclick handlers
window.initTradingWallet = initTradingWallet;
window.setBotPanel = setBotPanel;
window.exportBotPrivateKey = exportBotPrivateKey;
window.executeQuickTrade = executeQuickTrade;
window.executeSwapForm = executeSwapForm;
window.createDCA = createDCA;
window.cancelDCA = cancelDCA;
window.followWallet = followWallet;
window.unfollowWallet = unfollowWallet;
window.startCopyTrading = startCopyTrading;
window.stopCopyTrading = stopCopyTrading;
window.createTrigger = createTrigger;
window.cancelTrigger = cancelTrigger;
window.botKill = botKill;
window.botResume = botResume;
window.lookupToken = lookupToken;
window.sendTradingQuery = sendTradingQuery;

// ─── Trading Chat Functions ───

export async function sendTradingMessage(tokenAddress) {
  const input = document.getElementById('tradingInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text || TRADING.isGenerating) return;

  input.value = '';
  input.style.height = 'auto';

  const conv = getActiveTradingConversation();
  conv.messages.push({ role: 'user', content: text });

  appendTradingMessageToDOM({ role: 'user', content: text });
  showTradingTypingIndicator();
  TRADING.isGenerating = true;
  updateTradingSendButton();

  const model = TRADING.selectedModel || STATE.models[0] || 'claude-sonnet-4-5-20250929';

  try {
    TRADING.abortController = new AbortController();

    const systemPrompt = `You are an expert Solana trading analyst. Provide concise, data-driven analysis. When given a token address, analyze its trading metrics, liquidity, holder distribution, and risk factors. Format responses with clear sections. Use markdown tables for comparisons. Always include a risk assessment (Low/Medium/High/Critical).${tokenAddress ? ` The user is asking about token: ${tokenAddress}` : ''}`;

    const body = {
      model,
      messages: [
        { role: 'user', content: systemPrompt },
        { role: 'assistant', content: 'Understood. I\'ll provide concise, data-driven Solana trading analysis.' },
        ...conv.messages.map(m => ({ role: m.role, content: m.content })),
      ],
    };

    const response = await fetch(`${API_BASE}/v1/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${STATE.apiKeyFull}`,
      },
      body: JSON.stringify(body),
      signal: TRADING.abortController.signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
      throw new Error(err.message || 'Request failed');
    }

    removeTradingTypingIndicator();

    const msgEl = appendTradingMessageToDOM({ role: 'assistant', content: '' });
    const contentEl = msgEl.querySelector('.chat-msg-content');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        try {
          const data = JSON.parse(jsonStr);
          if (data.type === 'text') {
            fullText += data.content;
            contentEl.innerHTML = renderMarkdown(fullText);
            scrollTradingChat();
          } else if (data.type === 'error') {
            throw new Error(data.message);
          }
        } catch (e) {
          if (e.message && !e.message.includes('JSON')) throw e;
        }
      }
    }

    conv.messages.push({ role: 'assistant', content: fullText });
    saveTradingHistory();
    bindCodeCopyButtons();

  } catch (err) {
    removeTradingTypingIndicator();
    if (err.name !== 'AbortError') {
      appendTradingMessageToDOM({ role: 'assistant', content: `Error: ${err.message}`, isError: true });
    }
  } finally {
    TRADING.isGenerating = false;
    TRADING.abortController = null;
    updateTradingSendButton();
  }
}

export function appendTradingMessageToDOM(msg) {
  const container = document.getElementById('tradingMessages');
  if (!container) return null;

  const empty = container.querySelector('.chat-empty');
  if (empty) empty.remove();

  const el = document.createElement('div');
  el.className = `chat-message ${msg.role}`;
  el.innerHTML = `
    <div class="chat-msg-avatar">${msg.role === 'user' ? 'You' : 'AI'}</div>
    <div class="chat-msg-body">
      <div class="chat-msg-name">${msg.role === 'user' ? 'You' : 'AI'}</div>
      <div class="chat-msg-content${msg.isError ? ' error' : ''}">${
        msg.role === 'user' ? escapeHtml(msg.content) : (msg.content ? renderMarkdown(msg.content) : '')
      }</div>
    </div>
  `;
  container.appendChild(el);
  scrollTradingChat();
  return el;
}

export function showTradingTypingIndicator() {
  const container = document.getElementById('tradingMessages');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'chat-message assistant';
  el.id = 'tradingTypingIndicator';
  el.innerHTML = `
    <div class="chat-msg-avatar">AI</div>
    <div class="chat-msg-body">
      <div class="chat-typing">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    </div>
  `;
  container.appendChild(el);
  scrollTradingChat();
}

export function removeTradingTypingIndicator() {
  document.getElementById('tradingTypingIndicator')?.remove();
}

export function scrollTradingChat() {
  const el = document.getElementById('tradingMessages');
  if (el) el.scrollTop = el.scrollHeight;
}

export function updateTradingSendButton() {
  const btn = document.getElementById('tradingSendBtn');
  if (btn) {
    btn.disabled = TRADING.isGenerating;
    btn.textContent = TRADING.isGenerating ? '...' : '\u2192';
  }
}

window.sendTradingMessage = sendTradingMessage;
