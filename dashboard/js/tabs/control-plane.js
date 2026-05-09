// ═══════════════════════════════════════════
// Meterflow Dashboard - Meters, Receipts, Budgets
// ═══════════════════════════════════════════

import { STATE, API_BASE } from '../state.js';
import { api } from '../api.js';
import { render } from '../render.js';
import { showToast } from '../actions.js';
import { escapeHtml } from '../utils.js';
import { canManageMeterflow, renderPreviewNotice } from '../gate.js?v=preview-link-2';

const CP = {
  loaded: false,
  loading: false,
  meters: [],
  receipts: [],
  budgets: [],
  revenue: [],
  mcpTools: [],
};

const PREVIEW_METERS = [
  { id: 'mtr_chat', route: '/v1/chat', method: 'POST', unit: 'model call', priceUsd: 0.004, asset: 'USDC', status: 'live', mode: 'live' },
  { id: 'mtr_mcp_token_risk', route: '/mcp/token-risk', method: 'POST', unit: 'MCP tool call', priceUsd: 0.006, asset: 'USDC', status: 'live', mode: 'live' },
  { id: 'mtr_alpha', route: '/v1/alpha/*', method: 'GET', unit: 'alpha request', priceUsd: 0.012, asset: 'USDC', status: 'example', mode: 'test' },
];

const PREVIEW_RECEIPTS = [
  { id: 'rcpt_preview_001', createdAt: new Date().toISOString(), route: '/v1/chat', status: 'metered_key', amountUsd: 0.00404, baseAmountUsd: 0.004, protocolFeeUsd: 0.00004, protocolFeeBps: 100, asset: 'USDC', policyResult: 'allowed', latencyMs: 728 },
  { id: 'fail_preview_002', createdAt: new Date().toISOString(), route: '/mcp/token-risk', status: 'budget_exhausted', amountUsd: 0, asset: 'USDC', policyResult: 'daily_cap', latencyMs: 0 },
];

const PREVIEW_BUDGETS = [
  { id: 'bdg_preview_001', name: 'market-research-agent', status: 'active', dailyCapUsd: 25, perCallCapUsd: 0.05, spentUsdToday: 4.38, allowedMeterIds: ['mtr_chat', 'mtr_mcp_token_risk'] },
  { id: 'bdg_preview_002', name: 'support-agent', status: 'revoked', dailyCapUsd: 10, perCallCapUsd: 0.02, spentUsdToday: 0, allowedMeterIds: ['mtr_chat'] },
];

const PREVIEW_MCP_TOOLS = [
  { id: 'mcp_preview_001', name: 'Token Risk Score', route: '/mcp/token-risk', priceUsd: 0.006, status: 'live' },
  { id: 'mcp_preview_002', name: 'Wallet Funding Trace', route: '/mcp/wallet-trace', priceUsd: 0.012, status: 'test' },
];

const PREVIEW_REVENUE = [
  { meterId: 'mtr_chat', calls: 1284, estimatedUsd: 5.14 },
  { meterId: 'mtr_mcp_token_risk', calls: 412, estimatedUsd: 2.47 },
  { meterId: 'mtr_alpha', calls: 203, estimatedUsd: 2.44 },
];

function viewData() {
  if (canManageMeterflow()) return CP;
  return {
    meters: PREVIEW_METERS,
    receipts: PREVIEW_RECEIPTS,
    budgets: PREVIEW_BUDGETS,
    revenue: PREVIEW_REVENUE,
    mcpTools: PREVIEW_MCP_TOOLS,
  };
}

function money(value) {
  return `$${Number(value || 0).toFixed(Number(value || 0) >= 0.1 ? 2 : 3)}`;
}

function statusBadge(status) {
  const safe = escapeHtml(status || 'unknown');
  return `<span class="tool-status">${safe.toUpperCase()}</span>`;
}

function loadControlPlane(force = false) {
  if (!canManageMeterflow() || CP.loading || (CP.loaded && !force)) return;
  CP.loading = true;
  Promise.all([
    api('/v1/meters'),
    api('/v1/receipts?limit=80'),
    api('/v1/budgets'),
    api('/v1/providers/revenue'),
    api('/v1/mcp-tools'),
  ]).then(([meters, receipts, budgets, revenue, mcpTools]) => {
    CP.meters = meters.meters || [];
    CP.receipts = receipts.receipts || [];
    CP.budgets = budgets.budgets || [];
    CP.revenue = revenue.revenue || [];
    CP.mcpTools = mcpTools.tools || [];
    CP.loaded = true;
  }).catch(err => {
    showToast(err.message || 'Could not load Meterflow control plane', true);
  }).finally(() => {
    CP.loading = false;
    render();
  });
}

function renderLoading(title) {
  return `
    <div class="page-header">
      <h1 class="page-title">${title}</h1>
      <p class="page-sub">Loading Meterflow control-plane data...</p>
    </div>
    <div class="stats-row">
      <div class="stat-card skeleton"><div class="label">Loading</div><div class="skeleton-value"></div><div class="sub">&nbsp;</div></div>
      <div class="stat-card skeleton"><div class="label">Loading</div><div class="skeleton-value"></div><div class="sub">&nbsp;</div></div>
      <div class="stat-card skeleton"><div class="label">Loading</div><div class="skeleton-value"></div><div class="sub">&nbsp;</div></div>
      <div class="stat-card skeleton"><div class="label">Loading</div><div class="skeleton-value"></div><div class="sub">&nbsp;</div></div>
    </div>
  `;
}

function ensureLoaded(title) {
  if (!canManageMeterflow()) return true;
  loadControlPlane();
  return CP.loaded || renderLoading(title);
}

export function renderMeters() {
  const ready = ensureLoaded('Meters');
  if (ready !== true) return ready;

  const data = viewData();
  const locked = !canManageMeterflow();
  const active = data.meters.filter(m => m.status !== 'paused').length;
  const gross = data.revenue.reduce((sum, row) => sum + Number(row.estimatedUsd || 0), 0);
  return `
    <div class="page-header">
      <h1 class="page-title">Meters</h1>
      <p class="page-sub">Define what is billable: route, unit, price, policy, owner wallet, and current state.</p>
    </div>
    ${locked ? renderPreviewNotice('meters') : ''}
    <div class="stats-row">
      <div class="stat-card"><div class="label">Active Meters</div><div class="value accent">${active}</div><div class="sub">${data.meters.length} total configured</div></div>
      <div class="stat-card"><div class="label">Estimated Gross</div><div class="value green">${money(gross)}</div><div class="sub">from metered-key usage</div></div>
      <div class="stat-card"><div class="label">Settlement Asset</div><div class="value accent">USDC</div><div class="sub">MFLOW controls utility</div></div>
      <div class="stat-card"><div class="label">MCP Tools</div><div class="value">${data.mcpTools.length}</div><div class="sub">packaged tools</div></div>
    </div>

    <div class="section ${locked ? 'preview-disabled' : ''}">
      <div class="section-title">Create Meter</div>
      <div class="tool-config-box" style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;white-space:normal;">
        <input id="meterRoute" class="bot-form-input" placeholder="/v1/my-route" style="grid-column:span 2;">
        <select id="meterMethod" class="bot-form-input"><option>POST</option><option>GET</option><option>PUT</option><option>DELETE</option></select>
        <input id="meterUnit" class="bot-form-input" placeholder="request">
        <input id="meterPrice" class="bot-form-input" placeholder="0.006">
        <select id="meterStatus" class="bot-form-input"><option>test</option><option>live</option><option>paused</option></select>
        <button class="btn-sm primary" onclick="createMeterFromDashboard()" style="grid-column:span 6;">Create Meter</button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Endpoint Catalog</div>
      <div class="tools-grid">
        ${data.meters.map(meter => {
          const revenue = data.revenue.find(row => row.meterId === meter.id);
          return `
            <div class="tool-card">
              <div class="tool-header">${statusBadge(meter.status)}<span class="dim">${escapeHtml(meter.mode || 'test')}</span></div>
              <div class="tool-name">${escapeHtml(meter.route)}</div>
              <div class="tool-desc">
                Unit: ${escapeHtml(meter.unit)}<br>
                Price: ${money(meter.priceUsd)} ${escapeHtml(meter.asset || 'USDC')}<br>
                Calls: ${Number(revenue?.calls || 0).toLocaleString()} · Gross: ${money(revenue?.estimatedUsd || 0)}
              </div>
              <div class="tool-launch" onclick="${locked ? 'openTokenPurchase()' : `testMeter('${meter.id}')`}">${locked ? 'Unlock' : 'Test Quote'}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

export function renderReceipts() {
  const ready = ensureLoaded('Receipts');
  if (ready !== true) return ready;

  const data = viewData();
  const locked = !canManageMeterflow();
  const verified = data.receipts.filter(r => r.status === 'metered_key' || r.status === 'verified').length;
  const denied = data.receipts.filter(r => String(r.status).includes('denied') || String(r.status).includes('cap') || String(r.status).includes('exhausted')).length;
  const gross = data.receipts
    .filter(r => r.status === 'metered_key' || r.status === 'verified')
    .reduce((sum, r) => sum + Number(r.amountUsd || 0), 0);

  return `
    <div class="page-header">
      <h1 class="page-title">Receipts</h1>
      <p class="page-sub">Connect each request to quote, payer wallet, payment proof, policy result, response status, and exportable accounting records.</p>
    </div>
    ${locked ? renderPreviewNotice('receipts') : ''}
    <div class="stats-row">
      <div class="stat-card"><div class="label">Recorded</div><div class="value accent">${data.receipts.length}</div><div class="sub">latest events</div></div>
      <div class="stat-card"><div class="label">Allowed</div><div class="value green">${verified}</div><div class="sub">metered-key receipts</div></div>
      <div class="stat-card"><div class="label">Denied</div><div class="value">${denied}</div><div class="sub">policy/payment failures</div></div>
      <div class="stat-card"><div class="label">Gross</div><div class="value green">${money(gross)}</div><div class="sub">estimated USDC</div></div>
    </div>
    <div class="section">
      <div class="section-title">Recent Receipt Events</div>
      <div class="tool-config-box" style="white-space:normal;overflow:auto;">
        <table class="treasury-table">
          <thead><tr><th>Time</th><th>Receipt</th><th>Route</th><th>Status</th><th>Base</th><th>Fee</th><th>Total</th><th>Policy</th><th>Latency</th></tr></thead>
          <tbody>
            ${data.receipts.length ? data.receipts.map(r => `
              <tr>
                <td>${escapeHtml((r.createdAt || '').slice(0, 19).replace('T', ' '))}</td>
                <td>${escapeHtml(r.id)}</td>
                <td>${escapeHtml(r.route || '—')}</td>
                <td>${escapeHtml(r.status || '—')}</td>
                <td>${money(r.baseAmountUsd ?? r.amountUsd)}</td>
                <td>${money(r.protocolFeeUsd || 0)}${r.protocolFeeBps ? ` (${Number(r.protocolFeeBps) / 100}%)` : ''}</td>
                <td>${money(r.amountUsd)} ${escapeHtml(r.asset || 'USDC')}</td>
                <td>${escapeHtml(r.policyResult || '—')}</td>
                <td>${r.latencyMs ? Number(r.latencyMs).toLocaleString() + 'ms' : '—'}</td>
              </tr>
            `).join('') : '<tr><td colspan="9">No receipts yet. Run a metered API call to populate this ledger.</td></tr>'}
          </tbody>
        </table>
      </div>
      <div style="margin-top:12px;">
        <button class="btn-sm primary" onclick="${locked ? 'openTokenPurchase()' : 'downloadReceiptsCsv()'}">${locked ? 'Unlock Export' : 'Export CSV'}</button>
      </div>
    </div>
  `;
}

export function renderBudgets() {
  const ready = ensureLoaded('Agent Budgets');
  if (ready !== true) return ready;

  const data = viewData();
  const locked = !canManageMeterflow();
  const active = data.budgets.filter(b => b.status === 'active').length;
  const spent = data.budgets.reduce((sum, b) => sum + Number(b.spentUsdToday || 0), 0);
  return `
    <div class="page-header">
      <h1 class="page-title">Agent Budgets</h1>
      <p class="page-sub">Give agents controlled spend permissions before they call paid APIs or MCP tools.</p>
    </div>
    ${locked ? renderPreviewNotice('agent budgets') : ''}
    <div class="stats-row">
      <div class="stat-card"><div class="label">Active Budgets</div><div class="value accent">${active}</div><div class="sub">${data.budgets.length} total policies</div></div>
      <div class="stat-card"><div class="label">Spent Today</div><div class="value green">${money(spent)}</div><div class="sub">metered-key estimated spend</div></div>
      <div class="stat-card"><div class="label">Revocation</div><div class="value green">On</div><div class="sub">kill switch per budget</div></div>
      <div class="stat-card"><div class="label">MFLOW Utility</div><div class="value">Policy</div><div class="sub">higher limits and retention</div></div>
    </div>

    <div class="section ${locked ? 'preview-disabled' : ''}">
      <div class="section-title">Create Budget</div>
      <div class="tool-config-box" style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;white-space:normal;">
        <input id="budgetName" class="bot-form-input" placeholder="market-research-bot" style="grid-column:span 2;">
        <input id="budgetDailyCap" class="bot-form-input" placeholder="12.00">
        <input id="budgetPerCallCap" class="bot-form-input" placeholder="0.02">
        <select id="budgetAllowedMeters" class="bot-form-input" multiple style="grid-column:span 2;min-height:42px;">
          ${data.meters.map(m => `<option value="${m.id}" ${m.id.startsWith('mtr_chat') || m.id === 'mtr_multi' ? 'selected' : ''}>${escapeHtml(m.route)}</option>`).join('')}
        </select>
        <button class="btn-sm primary" onclick="createBudgetFromDashboard()" style="grid-column:span 6;">Create Budget Policy</button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Budget Policies</div>
      <div class="tools-grid">
        ${data.budgets.length ? data.budgets.map(budget => `
          <div class="tool-card">
            <div class="tool-header">${statusBadge(budget.status)}</div>
            <div class="tool-name">${escapeHtml(budget.name)}</div>
            <div class="tool-desc">
              Daily cap: ${money(budget.dailyCapUsd)}<br>
              Per-call cap: ${money(budget.perCallCapUsd)}<br>
              Spent today: ${money(budget.spentUsdToday)}<br>
              Allowed meters: ${(budget.allowedMeterIds || []).length || 'all'}
            </div>
            ${budget.status === 'active' ? `<div class="tool-launch" onclick="${locked ? 'openTokenPurchase()' : `revokeBudgetFromDashboard('${budget.id}')`}">${locked ? 'Unlock' : 'Revoke'}</div>` : '<div class="tool-launch">Revoked</div>'}
          </div>
        `).join('') : '<div class="tool-card"><div class="tool-name">No budgets yet</div><div class="tool-desc">Create a policy to cap agent spend and route access before automation runs.</div></div>'}
      </div>
    </div>
    <div class="compliance-notice">
      <div class="compliance-notice-header"><span class="compliance-dot"></span> Token Utility Layer</div>
      <div class="compliance-notice-text">
        USDC is the payment asset. MFLOW is the control-plane utility layer for provider verification, fee discounts, registry ranking, higher policy limits, and longer receipt retention.
      </div>
    </div>
  `;
}

export function renderMcpTools() {
  const ready = ensureLoaded('MCP Tools');
  if (ready !== true) return ready;
  const data = viewData();
  const locked = !canManageMeterflow();

  return `
    <div class="page-header">
      <h1 class="page-title">MCP Tools</h1>
      <p class="page-sub">Package MCP tools as priced capabilities with a hosted Meterflow gateway, receipts, budgets, and analytics.</p>
    </div>
    ${locked ? renderPreviewNotice('MCP tool monetization') : ''}
    <div class="section ${locked ? 'preview-disabled' : ''}">
      <div class="section-title">Package Tool</div>
      <div class="tool-config-box" style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;white-space:normal;">
        <input id="mcpName" class="bot-form-input" placeholder="Token Risk Score" style="grid-column:span 2;">
        <input id="mcpManifest" class="bot-form-input" placeholder="https://example.com/mcp/manifest.json" style="grid-column:span 2;">
        <input id="mcpPrice" class="bot-form-input" placeholder="0.006">
        <select id="mcpStatus" class="bot-form-input"><option>test</option><option>live</option><option>paused</option></select>
        <button class="btn-sm primary" onclick="createMcpToolFromDashboard()" style="grid-column:span 6;">Package MCP Tool</button>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Tool Catalog</div>
      <div class="tools-grid">
        ${data.mcpTools.length ? data.mcpTools.map(tool => `
          <div class="tool-card">
            <div class="tool-header">${statusBadge(tool.status)}</div>
            <div class="tool-name">${escapeHtml(tool.name)}</div>
            <div class="tool-desc">
              Route: ${escapeHtml(tool.route)}<br>
              Price: ${money(tool.priceUsd)} USDC<br>
              Gateway: /proxy${escapeHtml(tool.route)}
            </div>
            <div class="tool-launch" onclick="${locked ? 'openTokenPurchase()' : `copyText('https://meterflow.fun/proxy${escapeHtml(tool.route)}')`}">${locked ? 'Unlock' : 'Copy Gateway'}</div>
          </div>
        `).join('') : '<div class="tool-card"><div class="tool-name">No MCP tools yet</div><div class="tool-desc">Package a tool to generate a priced hosted gateway path.</div></div>'}
      </div>
    </div>
  `;
}

async function createMeterFromDashboard() {
  try {
    await api('/v1/meters', {
      method: 'POST',
      body: JSON.stringify({
        route: document.getElementById('meterRoute')?.value.trim(),
        method: document.getElementById('meterMethod')?.value,
        unit: document.getElementById('meterUnit')?.value.trim() || 'request',
        priceUsd: Number(document.getElementById('meterPrice')?.value || 0),
        status: document.getElementById('meterStatus')?.value || 'test',
      }),
    });
    CP.loaded = false;
    showToast('Meter created');
    loadControlPlane(true);
  } catch (err) {
    showToast(err.message || 'Meter creation failed', true);
  }
}

async function testMeter(meterId) {
  try {
    const data = await api(`/v1/meters/${meterId}/test`, { method: 'POST' });
    showToast(`Quote: ${money(data.quote.amountUsd)} ${data.quote.asset}`);
  } catch (err) {
    showToast(err.message || 'Meter test failed', true);
  }
}

async function createBudgetFromDashboard() {
  const select = document.getElementById('budgetAllowedMeters');
  const allowedMeterIds = select ? [...select.selectedOptions].map(opt => opt.value) : [];
  try {
    await api('/v1/budgets', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('budgetName')?.value.trim() || 'Agent budget',
        dailyCapUsd: Number(document.getElementById('budgetDailyCap')?.value || 12),
        perCallCapUsd: Number(document.getElementById('budgetPerCallCap')?.value || 0.02),
        allowedMeterIds,
      }),
    });
    CP.loaded = false;
    showToast('Budget policy created');
    loadControlPlane(true);
  } catch (err) {
    showToast(err.message || 'Budget creation failed', true);
  }
}

async function revokeBudgetFromDashboard(budgetId) {
  try {
    await api(`/v1/budgets/${budgetId}/revoke`, { method: 'POST' });
    CP.loaded = false;
    showToast('Budget revoked');
    loadControlPlane(true);
  } catch (err) {
    showToast(err.message || 'Budget revoke failed', true);
  }
}

async function createMcpToolFromDashboard() {
  try {
    await api('/v1/mcp-tools', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('mcpName')?.value.trim(),
        manifestUrl: document.getElementById('mcpManifest')?.value.trim(),
        priceUsd: Number(document.getElementById('mcpPrice')?.value || 0.006),
        status: document.getElementById('mcpStatus')?.value || 'test',
      }),
    });
    CP.loaded = false;
    showToast('MCP tool packaged');
    loadControlPlane(true);
  } catch (err) {
    showToast(err.message || 'MCP tool creation failed', true);
  }
}

async function downloadReceiptsCsv() {
  try {
    const res = await fetch(`${API_BASE}/v1/receipts/export.csv`, {
      headers: { Authorization: `Bearer ${STATE.apiKeyFull}` },
    });
    if (!res.ok) throw new Error('CSV export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'meterflow-receipts.csv';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    showToast(err.message || 'CSV export failed', true);
  }
}

window.createMeterFromDashboard = createMeterFromDashboard;
window.testMeter = testMeter;
window.createBudgetFromDashboard = createBudgetFromDashboard;
window.revokeBudgetFromDashboard = revokeBudgetFromDashboard;
window.createMcpToolFromDashboard = createMcpToolFromDashboard;
window.downloadReceiptsCsv = downloadReceiptsCsv;
