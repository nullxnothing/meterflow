// ═══════════════════════════════════════════
// Meterflow Dashboard - Trading Panel Renderers
// ═══════════════════════════════════════════

import { TRADING } from '../state.js';
import { escapeHtml } from '../utils.js';
import { formatCompact, formatTokenPrice } from '../utils.js';

export function renderBotPortfolio() {
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

export function renderBotOverview() {
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

export function renderBotSwap() {
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

export function renderBotDCA() {
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

export function renderBotCopy() {
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

export function renderBotTriggers() {
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

export function renderBotHistory() {
  return `<div>
    <h2>Trade History</h2>
    ${renderBotHistoryTable(TRADING.history)}
  </div>`;
}

export function renderBotHistoryTable(entries) {
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
            <td>${t.sig ? '<a href="https://solscan.io/tx/' + escapeHtml(t.sig) + '" target="_blank" style="color:var(--accent);">' + escapeHtml(t.sig.slice(0, 8)) + '...</a>' : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}
