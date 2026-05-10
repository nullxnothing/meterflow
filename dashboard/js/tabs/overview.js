// ═══════════════════════════════════════════
// Meterflow Dashboard - Tab: Overview
// ═══════════════════════════════════════════

import { STATE } from '../state.js';
import { escapeHtml } from '../utils.js';
import { isHolder, renderTokenUtilityPanel } from '../gate.js?v=preview-link-2';

function getResetCountdown() {
  const now = new Date();
  const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const diff = utcMidnight - now;
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

function hasAnyChatProvider() {
  return STATE.providers.claude || STATE.providers.gemini || STATE.providers.openai;
}

function isVideoTierAllowed() {
  const t = (STATE.tier || '').toLowerCase();
  return t === 'operator' || t === 'architect' || t === 'alpha';
}

export function renderOverview() {
  const hasKey = isHolder();

  if (!hasKey) {
    return renderPublicOverview();
  }

  const isLoaded = STATE.usage.limit > 0 || STATE.tier;
  const usagePct = STATE.usage.limit > 0 ? (STATE.usage.today / STATE.usage.limit) * 100 : 0;
  const barClass = usagePct > 90 ? 'danger' : usagePct > 70 ? 'warning' : '';
  const resetTime = getResetCountdown();
  return `
    <div class="page-header">
      <h1 class="page-title">Meterflow control plane</h1>
      <p class="page-sub">${STATE.usage.remaining.toLocaleString()} metered calls remaining today. Utility tier: ${STATE.tier || '\u2014'}.</p>
    </div>
    <div class="stats-row">
      ${isLoaded ? `
        <div class="stat-card"><div class="label">Metering</div><div class="value accent">Live</div><div class="sub">request-level usage</div></div>
        <div class="stat-card"><div class="label">Calls Today</div><div class="value">${STATE.usage.today.toLocaleString()}</div><div class="sub">of ${STATE.usage.limit.toLocaleString()} limit</div></div>
        <div class="stat-card"><div class="label">Services</div><div class="value green">${STATE.models.length}</div><div class="sub">bundled AI routes online</div></div>
        <div class="stat-card"><div class="label">Utility Tier</div><div class="value accent">${STATE.tier || '\u2014'}</div><div class="sub">${(STATE.balance ?? 0).toLocaleString()} ${STATE.token?.symbol || 'MFLOW'}</div></div>
      ` : `
        <div class="stat-card skeleton"><div class="label">Your Tier</div><div class="skeleton-value"></div><div class="sub" style="visibility:hidden">.</div></div>
        <div class="stat-card skeleton"><div class="label">Calls Today</div><div class="skeleton-value"></div><div class="sub" style="visibility:hidden">.</div></div>
        <div class="stat-card skeleton"><div class="label">Models Available</div><div class="skeleton-value"></div><div class="sub" style="visibility:hidden">.</div></div>
        <div class="stat-card skeleton"><div class="label">Metering</div><div class="skeleton-value"></div><div class="sub" style="visibility:hidden">.</div></div>
      `}
    </div>
    ${renderTokenUtilityPanel({ compact: true })}
    <div class="section">
      <div class="section-title">Metered Usage</div>
      <div class="usage-bar-container">
        <div class="usage-header">
          <div class="usage-count">${STATE.usage.today.toLocaleString()} <span>/ ${STATE.usage.limit.toLocaleString()} metered calls</span></div>
          <div class="usage-count">${Math.round(usagePct)}%</div>
        </div>
        <div class="usage-bar-track"><div class="usage-bar-fill ${barClass}" style="width: ${usagePct}%"></div></div>
        <div class="usage-legend">
          <div class="usage-legend-item"><div class="usage-legend-dot" style="background: var(--accent)"></div>Used</div>
          <div class="usage-legend-item"><div class="usage-legend-dot" style="background: var(--border)"></div>Remaining</div>
          <div class="usage-legend-item" style="margin-left: auto">Resets in ${resetTime}</div>
        </div>
        ${usagePct >= 90 ? `<div class="usage-warn-inline danger">${usagePct >= 100 ? 'Daily limit reached \u2014 calls will resume at midnight UTC.' : `${STATE.usage.remaining.toLocaleString()} calls remaining \u2014 approaching daily limit.`}</div>` : usagePct >= 70 ? `<div class="usage-warn-inline warning">${Math.round(100 - usagePct)}% of daily quota remaining. Resets in ${resetTime}.</div>` : ''}
      </div>
    </div>
    <div class="section">
      <div class="section-title">Control Plane</div>
      <div class="tools-grid">
        <div class="tool-card" onclick="setTab('meters')"><div class="tool-header"><span class="tool-status">NEW</span></div><div class="tool-name">Meters</div><div class="tool-desc">Define billable routes, units, prices, owners, and test/live state for API products.</div><div class="tool-launch">Configure</div></div>
        <div class="tool-card" onclick="setTab('receipts')"><div class="tool-header"><span class="tool-status">NEW</span></div><div class="tool-name">Receipts</div><div class="tool-desc">Inspect paid requests, failures, payment proof, caller identity, and exportable records.</div><div class="tool-launch">Inspect</div></div>
        <div class="tool-card" onclick="setTab('budgets')"><div class="tool-header"><span class="tool-status">NEW</span></div><div class="tool-name">Agent Budgets</div><div class="tool-desc">Set route allowlists, per-call caps, daily caps, revocation, and operator approval rules.</div><div class="tool-launch">Control</div></div>
        <div class="tool-card" onclick="setTab('mcp-tools')"><div class="tool-header"><span class="tool-status">NEW</span></div><div class="tool-name">MCP Tools</div><div class="tool-desc">Package, price, meter, and monitor MCP tools through a hosted Meterflow gateway.</div><div class="tool-launch">Package</div></div>
        <div class="tool-card" onclick="setTab('webhooks')"><div class="tool-header"><span class="tool-status">LIVE</span></div><div class="tool-name">Webhooks</div><div class="tool-desc">Send signed events for receipts, failed payments, budget exhaustion, and test deliveries.</div><div class="tool-launch">Configure</div></div>
        <div class="tool-card" onclick="setTab('keys')"><div class="tool-header"><span class="tool-status">LIVE</span></div><div class="tool-name">API Keys</div><div class="tool-desc">Issue developer keys for metered services. Current keys power the bundled AI gateway and upcoming meter clients.</div><div class="tool-launch">View Key</div></div>
        <div class="tool-card" onclick="setTab('models')"><div class="tool-header"><span class="tool-status">LIVE</span></div><div class="tool-name">Service Routes</div><div class="tool-desc">Inspect bundled routes that run through the same meter, receipt, and budget model.</div><div class="tool-launch">View</div></div>
        <div class="tool-card" onclick="setTab('future-apis')"><div class="tool-header"><span class="tool-status">LIVE</span></div><div class="tool-name">Integrations</div><div class="tool-desc">Manage provider, data, wallet, and notification integrations that can be attached to meters.</div><div class="tool-launch">Open</div></div>
      </div>
    </div>
    <div class="compliance-notice">
      <div class="compliance-notice-header"><span class="compliance-dot"></span> Product Direction</div>
      <div class="compliance-notice-text">
        The current dashboard records live metered-key receipts and budget policy results while USDC/x402 settlement is integrated. Non-holders can still use paid Meterflow routes, but pay the protocol fee; ${STATE.token?.symbol || 'MFLOW'} holders get fee relief, higher limits, retention, and provider controls.
      </div>
    </div>
  `;
}

function renderPublicOverview() {
  return `
    <div class="page-header">
      <h1 class="page-title">Meterflow</h1>
      <p class="page-sub">Connect a wallet, issue metered clients, and visualize x402-style paid API usage on Solana.</p>
    </div>

    ${!STATE.connected ? `
      <div class="onboarding-hero">
        <div class="onboarding-hero-eyebrow">
          <span class="onboarding-hero-dot"></span>
          New here? Start in 60 seconds
        </div>
        <h2 class="onboarding-hero-title">Connect a wallet to start metering paid API usage.</h2>
        <p class="onboarding-hero-sub">No card. No subscription. Wallets handle identity and settlement &mdash; you keep control of every key, budget, and route.</p>
        <ol class="onboarding-steps">
          <li><span class="onboarding-step-num">1</span><div><strong>Connect</strong><span>Phantom, Solflare, or any Solana wallet</span></div></li>
          <li><span class="onboarding-step-num">2</span><div><strong>Issue a key</strong><span>Bind a metered client to your wallet</span></div></li>
          <li><span class="onboarding-step-num">3</span><div><strong>Set a budget</strong><span>Cap what each agent can spend</span></div></li>
        </ol>
        <div class="onboarding-cta-row">
          <button class="btn-primary onboarding-cta" onclick="openWalletConnect()">Connect Wallet</button>
          <a href="/docs" class="onboarding-link">Or read the docs &rarr;</a>
        </div>
      </div>
    ` : `
      <div class="section" style="text-align:center;padding:24px 0;">
        <p style="color:var(--text-muted);font-size:13px;">Your wallet is connected. Utility balance: <strong>${(STATE.balance ?? 0).toLocaleString()} ${STATE.token?.symbol || 'MFLOW'}</strong>.</p>
      </div>
    `}

    <div class="stats-row">
      <div class="stat-card preview"><div class="label">Meters</div><div class="value">—</div><div class="sub">price API calls and tools</div></div>
      <div class="stat-card preview"><div class="label">Receipts</div><div class="value">—</div><div class="sub">connect payment to usage</div></div>
      <div class="stat-card preview"><div class="label">Budgets</div><div class="value">—</div><div class="sub">limit autonomous spend</div></div>
      <div class="stat-card preview"><div class="label">MCP Tools</div><div class="value">—</div><div class="sub">package paid capabilities</div></div>
    </div>
    ${renderTokenUtilityPanel({ compact: true })}
    <div class="section">
      <div class="section-title">What The Dashboard Is For</div>
      <div class="tools-grid">
        <div class="tool-card" onclick="setTab('meters')"><div class="tool-header"><span class="tool-status">NEW</span></div><div class="tool-name">Meters</div><div class="tool-desc">Map routes and tools to billable units, prices, providers, and settlement policy.</div><div class="tool-launch">Open</div></div>
        <div class="tool-card" onclick="setTab('receipts')"><div class="tool-header"><span class="tool-status">NEW</span></div><div class="tool-name">Receipts</div><div class="tool-desc">Connect payments to requests so builders can audit usage and revenue.</div><div class="tool-launch">View</div></div>
        <div class="tool-card" onclick="setTab('budgets')"><div class="tool-header"><span class="tool-status">NEW</span></div><div class="tool-name">Agent Budgets</div><div class="tool-desc">Limit what an autonomous agent can buy before workflows run.</div><div class="tool-launch">Control</div></div>
        <div class="tool-card" onclick="setTab('mcp-tools')"><div class="tool-header"><span class="tool-status">NEW</span></div><div class="tool-name">MCP Tools</div><div class="tool-desc">Turn MCP tools into priced products with receipts and budget enforcement.</div><div class="tool-launch">Package</div></div>
        <div class="tool-card" onclick="setTab('webhooks')"><div class="tool-header"><span class="tool-status">LIVE</span></div><div class="tool-name">Webhooks</div><div class="tool-desc">Subscribe to signed payment, receipt, and budget events from the gateway.</div><div class="tool-launch">Configure</div></div>
        <div class="tool-card" onclick="setTab('keys')"><div class="tool-header"><span class="tool-status">LIVE</span></div><div class="tool-name">Developer Keys</div><div class="tool-desc">Create keys that identify metered clients and power the current gateway.</div><div class="tool-launch">Open</div></div>
        <div class="tool-card" onclick="setTab('models')"><div class="tool-header"><span class="tool-status">LIVE</span></div><div class="tool-name">Service Routes</div><div class="tool-desc">View bundled API, model, data, and workflow routes that can be priced and controlled.</div><div class="tool-launch">View</div></div>
        <div class="tool-card" onclick="setTab('future-apis')"><div class="tool-header"><span class="tool-status">LIVE</span></div><div class="tool-name">Integrations</div><div class="tool-desc">Attach Solana infrastructure, data, social, and notification providers to Meterflow routes.</div><div class="tool-launch">Open</div></div>
      </div>
    </div>
    <div class="compliance-notice">
      <div class="compliance-notice-header"><span class="compliance-dot"></span> Why This Exists</div>
      <div class="compliance-notice-text">
        Payment rails let agents pay. Meterflow is where builders manage what is metered, which wallet funded it, what failed, how much an agent can spend, and which providers earn fee relief and reputation through ${STATE.token?.symbol || 'MFLOW'} utility.
      </div>
    </div>
  `;
}
