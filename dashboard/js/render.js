// ═══════════════════════════════════════════
// Meterflow Dashboard - Render Module
// ═══════════════════════════════════════════

import { STATE } from './state.js';
import { escapeHtml } from './utils.js';
import { getWalletProviders } from './wallet.js?v=v10-ledger';
import { bindEvents } from './events.js';

// Tab renderers
import { renderOverview } from './tabs/overview.js?v=v12-onboard';
import { renderMeters, renderReceipts, renderBudgets, renderMcpTools, renderWebhooks } from './tabs/control-plane.js?v=v11-acceptance';
import { renderKeys } from './tabs/keys.js?v=v5-clean-mflow';
import { renderModels } from './tabs/models.js?v=v5-clean-mflow';
import { renderConnections } from './tabs/connections.js?v=logos';
import { renderChat } from './tabs/chat.js';
import { renderImages } from './tabs/images.js';
import { renderVideo } from './tabs/video.js';
import { renderTrading } from './tabs/trading.js';
import { renderFutureApis } from './tabs/future-apis.js?v=logos-3';
import { renderHolderTools } from './tabs/holder-tools.js?v=agent-checkout-1';
import { renderTreasury } from './tabs/treasury.js?v=v5-clean-mflow';
import { renderLiveTrades } from './tabs/live-trades.js';

export function render() {
  const app = document.getElementById('app');
  app.className = 'app';
  app.innerHTML = renderDashboard();
  bindEvents();
}

// Kept for potential modal use but no longer gates the dashboard
export function renderConnectScreen() {
  const providers = getWalletProviders();
  const hasWallet = providers.length > 0;
  return `
    <div class="connect-screen">
      <div class="connect-box">
        <div class="logo"><img class="brand-mark" src="/assets/brand/meterflow-mark.svg" alt=""></div>
        <h1>Meterflow Dashboard</h1>
        <p>Connect your wallet to manage meters, receipts, agent budgets, service routes, and API keys.</p>
        ${STATE.error ? `<div class="connect-error">${escapeHtml(STATE.error)}</div>` : ''}
        <div class="connect-wallets">
          ${STATE.connecting ? `<button class="connect-btn btn-loading" disabled style="min-height:52px;">Connecting...</button>` : hasWallet ? providers.map((p, i) => `
            <button class="connect-btn${i > 0 ? ' connect-btn-secondary' : ''}" data-provider="${i}">
              <img src="${p.icon}" alt="${p.name}" width="20" height="20" style="border-radius:4px;">
              Connect ${p.name}
            </button>
          `).join('') : `
            <button class="connect-btn" onclick="window.open('https://phantom.com/download','_blank')">Install Phantom Wallet</button>
          `}
        </div>
        <div class="connect-note">${hasWallet ? providers.map(p => p.name).join(', ') + ' detected' : 'No wallet detected'}</div>
      </div>
    </div>
  `;
}

export function renderDashboard() {
  const isChat = STATE.activeTab === 'chat' || STATE.activeTab === 'trading';
  const hasKey = !!STATE.apiKeyFull;
  const usagePct = STATE.usage.limit > 0 ? Math.min((STATE.usage.today / STATE.usage.limit) * 100, 100) : 0;
  const usageBarClass = usagePct > 90 ? 'danger' : usagePct > 70 ? 'warning' : '';
  const resetTime = getResetCountdown();
  return `
    <div class="mobile-header">
      <span class="mobile-logo"><img class="brand-mark" src="/assets/brand/meterflow-mark.svg" alt="">Meterflow</span>
      <div class="mobile-header-right">
        ${STATE.connected
          ? `<span class="mobile-tier">${STATE.isGuest ? 'Guest' : (STATE.tier || '')}</span>`
          : `<button class="btn-sm primary mobile-connect-btn" onclick="openWalletConnect()">Connect</button>`
        }
        <button class="mobile-hamburger" id="mobileMenuBtn">\u2630</button>
      </div>
    </div>
    <div class="mobile-nav-overlay" id="mobileNavOverlay">
      <div class="mobile-nav-drawer" id="mobileNavDrawer">
        <button class="mobile-nav-close" id="mobileNavClose">\u00d7</button>
        <div class="sidebar-logo" style="margin-bottom:32px;"><img class="brand-mark" src="/assets/brand/meterflow-mark.svg" alt="">Meterflow</div>
        ${renderNavItems()}
        <div class="mobile-nav-account">
          ${STATE.connected && STATE.isGuest ? `
            <div class="wallet-info" style="color:var(--accent);">Guest — Free Access</div>
            <button class="btn-primary" style="width:100%;padding:12px;margin-top:8px;" onclick="openWalletConnect()">Connect Wallet to Keep Access</button>
          ` : STATE.connected ? `
            <div class="wallet-info">${STATE.tier ? STATE.tier + ' Tier' : 'Connected'} \u2014 ${(STATE.balance ?? 0).toLocaleString()} ${STATE.token?.symbol || 'MFLOW'}</div>
            <div class="wallet-addr" onclick="copyText('${STATE.wallet}')">${STATE.wallet ? STATE.wallet.slice(0, 6) + '...' + STATE.wallet.slice(-4) : '\u2014'}<span class="copy" style="color:var(--accent);font-size:10px;">COPY</span></div>
            <button class="btn-sm danger" style="width:100%;padding:10px;margin-top:4px;" onclick="disconnectWallet()">Disconnect</button>
          ` : `
            <button class="btn-primary" style="width:100%;padding:12px;margin-top:8px;" onclick="openWalletConnect()">Connect Wallet</button>
          `}
        </div>
      </div>
    </div>
    <aside class="sidebar">
      <div class="sidebar-logo">
        <img class="brand-mark" src="/assets/brand/meterflow-mark.svg" alt="">
        Meterflow
        <span class="status-dot ${hasKey ? 'online' : 'offline'}" id="connectionDot" title="${hasKey ? 'Connected' : 'Not connected'}"></span>
      </div>
      <button class="sidebar-cmdk" onclick="openCommandPalette()" title="Search tabs (⌘K)">
        <span class="sidebar-cmdk-icon">⌕</span>
        <span class="sidebar-cmdk-label">Quick jump</span>
        <span class="sidebar-cmdk-kbd">⌘K</span>
      </button>
      <nav class="sidebar-nav">
        ${renderNavItems()}
      </nav>
      <div class="sidebar-footer">
        ${hasKey && STATE.isGuest ? `
          <div class="sidebar-usage" id="sidebarUsage">
            <div class="sidebar-usage-header">
              <span class="sidebar-usage-label">Metered Usage</span>
              <span class="sidebar-usage-count">${STATE.usage.limit === 0 ? '...' : STATE.usage.remaining.toLocaleString() + ' left'}</span>
            </div>
            <div class="sidebar-usage-track">
              <div class="sidebar-usage-fill ${usageBarClass}" style="width: ${usagePct}%"></div>
            </div>
            <div class="sidebar-usage-reset">resets ${resetTime}</div>
          </div>
          <div class="wallet-info" id="sidebarFooterInfo" style="color:var(--accent);">Guest — Free Access</div>
          <div class="sidebar-connect-cta" style="margin-top:8px;">
            <div class="sidebar-connect-text" style="font-size:11px;">Connect wallet or use a paid Meterflow flow to keep access</div>
            <button class="btn-primary sidebar-connect-btn" onclick="openWalletConnect()" style="margin-top:8px;">Connect Wallet</button>
          </div>
        ` : hasKey ? `
          <div class="sidebar-usage" id="sidebarUsage">
            <div class="sidebar-usage-header">
              <span class="sidebar-usage-label">Metered Usage</span>
              <span class="sidebar-usage-count">${STATE.usage.limit === 0 ? '...' : STATE.usage.remaining.toLocaleString() + ' left'}</span>
            </div>
            <div class="sidebar-usage-track">
              <div class="sidebar-usage-fill ${usageBarClass}" style="width: ${usagePct}%"></div>
            </div>
            <div class="sidebar-usage-reset">resets ${resetTime}</div>
          </div>
          <div class="wallet-info" id="sidebarFooterInfo">${STATE.tier ? STATE.tier + ' Tier' : 'Loading...'} \u2014 ${(STATE.balance ?? 0).toLocaleString()} ${STATE.token?.symbol || 'MFLOW'}</div>
          <div class="wallet-addr" onclick="copyText('${STATE.wallet}')">
            ${STATE.wallet ? STATE.wallet.slice(0, 6) + '...' + STATE.wallet.slice(-4) : '\u2014'}
            <span class="copy">COPY</span>
          </div>
          <div style="margin-top:8px;">
            <button class="btn-sm danger" style="width:100%;padding:8px;" onclick="disconnectWallet()">Disconnect</button>
          </div>
        ` : STATE.connected ? `
          <div class="wallet-info" id="sidebarFooterInfo">Connected \u2014 ${(STATE.balance ?? 0).toLocaleString()} ${STATE.token?.symbol || 'MFLOW'}</div>
          <div class="wallet-addr" onclick="copyText('${STATE.wallet}')">
            ${STATE.wallet ? STATE.wallet.slice(0, 6) + '...' + STATE.wallet.slice(-4) : '\u2014'}
            <span class="copy">COPY</span>
          </div>
          <div style="margin-top:8px;">
            <button class="btn-sm danger" style="width:100%;padding:8px;" onclick="disconnectWallet()">Disconnect</button>
          </div>
        ` : `
          <div class="sidebar-connect-cta">
            <div class="sidebar-connect-text">Connect wallet to configure meters, budgets, receipts, and keys</div>
            <button class="btn-primary sidebar-connect-btn" onclick="openWalletConnect()">Connect Wallet</button>
          </div>
        `}
        <div class="sidebar-socials">
          <a href="https://x.com/meterflowsol" target="_blank" rel="noopener" class="sidebar-social-link" aria-label="Meterflow on X" title="X / Twitter">
            <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.844l-5.36-7.013L4.16 22H.9l8.025-9.17L1.5 2h6.97l4.84 6.4L18.244 2Zm-1.2 18h1.86L7.04 4H5.05l11.994 16Z"/></svg>
          </a>
          <a href="https://discord.gg/tned74z4eN" target="_blank" rel="noopener" class="sidebar-social-link" aria-label="Meterflow Discord" title="Discord">
            <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M19.27 5.33a17.6 17.6 0 0 0-4.43-1.38.07.07 0 0 0-.07.04c-.19.34-.4.78-.55 1.13a16.3 16.3 0 0 0-4.92 0c-.15-.36-.37-.79-.56-1.13a.07.07 0 0 0-.07-.04 17.6 17.6 0 0 0-4.43 1.38.06.06 0 0 0-.03.03A18.06 18.06 0 0 0 .73 17.51a.07.07 0 0 0 .03.05 17.7 17.7 0 0 0 5.34 2.7.07.07 0 0 0 .08-.03c.41-.56.78-1.16 1.1-1.79a.07.07 0 0 0-.04-.1 11.7 11.7 0 0 1-1.67-.8.07.07 0 0 1 0-.12c.11-.08.22-.17.33-.26a.07.07 0 0 1 .07 0 12.6 12.6 0 0 0 10.74 0 .07.07 0 0 1 .07 0c.11.09.22.18.33.26a.07.07 0 0 1 0 .12c-.53.31-1.09.58-1.67.8a.07.07 0 0 0-.04.1c.33.63.7 1.23 1.1 1.79a.07.07 0 0 0 .08.03 17.6 17.6 0 0 0 5.35-2.7.07.07 0 0 0 .03-.05 17.95 17.95 0 0 0-3.46-12.15.06.06 0 0 0-.03-.03ZM8.52 15.33c-1.06 0-1.93-.97-1.93-2.16 0-1.2.86-2.17 1.93-2.17 1.08 0 1.94.98 1.93 2.17 0 1.19-.86 2.16-1.93 2.16Zm6.97 0c-1.06 0-1.93-.97-1.93-2.16 0-1.2.85-2.17 1.93-2.17 1.08 0 1.94.98 1.93 2.17 0 1.19-.85 2.16-1.93 2.16Z"/></svg>
          </a>
          <a href="https://github.com/nullxnothing/meterflow" target="_blank" rel="noopener" class="sidebar-social-link" aria-label="Meterflow on GitHub" title="GitHub">
            <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.05c-3.2.7-3.87-1.37-3.87-1.37-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.9-.39.99 0 1.98.13 2.9.39 2.21-1.49 3.18-1.18 3.18-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.06.78 2.13v3.16c0 .31.21.67.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z"/></svg>
          </a>
        </div>
        <div class="compliance-badge" title="Meterflow tracks usage, receipts, route access, and budget limits for agent-accessible APIs.">
          <span class="compliance-dot"></span> Metering Active
        </div>
      </div>
    </aside>
    <main class="main${isChat ? ' chat-mode' : ''}">${renderStatusBanner()}${renderTab()}</main>
  `;
}

function renderStatusBanner() {
  const s = STATE.providerStatus;
  if (!s || s.indicator === 'none') return '';
  const text = s.incident ? s.incident.name : s.description;
  return `
    <div class="status-banner status-banner--${s.indicator}" id="claudeStatusBanner">
      <span class="status-banner-dot"></span>
      <span class="status-banner-text">${escapeHtml(text)}</span>
      <button class="status-banner-close" onclick="this.parentElement.style.display='none'" aria-label="Dismiss">&times;</button>
    </div>
  `;
}

function renderNavItems() {
  const t = STATE.activeTab;
  return `
    <div class="nav-group-label">Control Plane</div>
    <div class="nav-item ${t === 'overview' ? 'active' : ''}" data-tab="overview">Overview</div>
    <div class="nav-item ${t === 'meters' ? 'active' : ''}" data-tab="meters">Meters</div>
    <div class="nav-item ${t === 'receipts' ? 'active' : ''}" data-tab="receipts">Receipts</div>
    <div class="nav-item ${t === 'budgets' ? 'active' : ''}" data-tab="budgets">Agent Budgets</div>
    <div class="nav-item ${t === 'mcp-tools' ? 'active' : ''}" data-tab="mcp-tools">MCP Tools</div>
    <div class="nav-item ${t === 'webhooks' ? 'active' : ''}" data-tab="webhooks">Webhooks</div>
    <div class="nav-item ${t === 'keys' ? 'active' : ''}" data-tab="keys">API Keys</div>
    <div class="nav-item ${t === 'models' ? 'active' : ''}" data-tab="models">Service Routes</div>
    <div class="nav-item ${t === 'connections' ? 'active' : ''}" data-tab="connections">Connections</div>

    <div class="nav-group-label">Operations</div>
    <div class="nav-item ${t === 'holder-tools' ? 'active' : ''}" data-tab="holder-tools">Agent Checkout</div>
    <div class="nav-item ${t === 'treasury' ? 'active' : ''}" data-tab="treasury">Settlement Wallet</div>
    <div class="nav-item ${t === 'future-apis' ? 'active' : ''}" data-tab="future-apis">Integrations</div>
  `;
}

function getResetCountdown() {
  const now = new Date();
  const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const diff = utcMidnight - now;
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `in ${hours}h ${mins}m`;
}

export function renderTab() {
  try {
    switch (STATE.activeTab) {
      case 'overview': return renderOverview();
      case 'meters': return renderMeters();
      case 'receipts': return renderReceipts();
      case 'budgets': return renderBudgets();
      case 'mcp-tools': return renderMcpTools();
      case 'webhooks': return renderWebhooks();
      case 'keys': return renderKeys();
      case 'models': return renderModels();
      case 'connections': return renderConnections();
      case 'chat': return renderChat();
      case 'images': return renderImages();
      case 'video': return renderVideo();
      case 'live-trades': return renderLiveTrades();
      case 'trading': return renderTrading();
      case 'future-apis': return renderFutureApis();
      case 'holder-tools': return renderHolderTools();
      case 'treasury': return renderTreasury();
      default: return renderOverview();
    }
  } catch (err) {
    console.error(`[Meterflow] Tab render error (${STATE.activeTab}):`, err);
    return `
      <div class="page-header">
        <h1 class="page-title">Something went wrong</h1>
        <p class="page-sub">This tab encountered an error. Try refreshing or switching tabs.</p>
      </div>
      <div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);padding:24px;background:var(--surface);border:1px solid var(--border);">
        ${escapeHtml(err.message || 'Unknown error')}
      </div>
    `;
  }
}

// Fast tab switch — only updates <main> content + nav active states, preserves sidebar scroll
export function switchTabInPlace(tab) {
  const mainEl = document.querySelector('.main');
  if (!mainEl) return false;

  STATE.activeTab = tab;

  // Update main content
  const isChat = tab === 'chat' || tab === 'trading';
  mainEl.className = 'main' + (isChat ? ' chat-mode' : '');
  mainEl.innerHTML = renderStatusBanner() + renderTab();

  // Update nav active states (sidebar + mobile drawer)
  document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tab);
  });

  // Re-bind events scoped to main content only (sidebar already has listeners)
  bindEvents(mainEl);

  // Scroll main to top for new tab
  mainEl.scrollTop = 0;

  return true;
}
