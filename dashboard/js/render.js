// ═══════════════════════════════════════════
// INFINITE Dashboard - Render Module
// ═══════════════════════════════════════════

import { STATE } from './state.js';
import { escapeHtml } from './api.js';
import { getWalletProviders } from './wallet.js';
import { bindEvents } from './events.js';

// Tab renderers
import { renderOverview } from './tabs/overview.js';
import { renderKeys } from './tabs/keys.js';
import { renderModels } from './tabs/models.js';
import { renderConnections } from './tabs/connections.js';
import { renderChat } from './tabs/chat.js';
import { renderImages } from './tabs/images.js';
import { renderVideo } from './tabs/video.js';
import { renderTrading } from './tabs/trading.js';
import { renderAgents } from './tabs/agents.js';
import { renderMyAgents } from './tabs/my-agents.js';
import { renderFutureApis } from './tabs/future-apis.js';
import { renderTreasury } from './tabs/treasury.js';
import { renderLiveTrades } from './tabs/live-trades.js';
import { renderXTools } from './tabs/x-tools.js';
import { renderLaunch } from './tabs/launch.js';

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
        <div class="logo">INF</div>
        <h1>INFINITE Dashboard</h1>
        <p>Connect your wallet to access AI chat, image generation, trading tools, and raw API keys.</p>
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
      <span class="mobile-logo">INFINITE</span>
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
        <div class="sidebar-logo" style="margin-bottom:32px;">INFINITE</div>
        ${renderNavItems()}
        <div class="mobile-nav-account">
          ${STATE.connected && STATE.isGuest ? `
            <div class="wallet-info" style="color:var(--accent);">Guest — Free Access</div>
            <button class="btn-primary" style="width:100%;padding:12px;margin-top:8px;" onclick="openWalletConnect()">Connect Wallet to Keep Access</button>
          ` : STATE.connected ? `
            <div class="wallet-info">${STATE.tier ? STATE.tier + ' Tier' : 'Connected'} \u2014 ${(STATE.balance ?? 0).toLocaleString()} $INF</div>
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
        INFINITE
        <span class="status-dot ${hasKey ? 'online' : 'offline'}" id="connectionDot" title="${hasKey ? 'Connected' : 'Not connected'}"></span>
      </div>
      <nav class="sidebar-nav">
        ${renderNavItems()}
      </nav>
      <div class="sidebar-footer">
        ${hasKey && STATE.isGuest ? `
          <div class="sidebar-usage" id="sidebarUsage">
            <div class="sidebar-usage-header">
              <span class="sidebar-usage-label">API Usage</span>
              <span class="sidebar-usage-count">${STATE.usage.limit === 0 ? '...' : STATE.usage.remaining.toLocaleString() + ' left'}</span>
            </div>
            <div class="sidebar-usage-track">
              <div class="sidebar-usage-fill ${usageBarClass}" style="width: ${usagePct}%"></div>
            </div>
            <div class="sidebar-usage-reset">resets ${resetTime}</div>
          </div>
          <div class="wallet-info" id="sidebarFooterInfo" style="color:var(--accent);">Guest — Free Access</div>
          <div class="sidebar-connect-cta" style="margin-top:8px;">
            <div class="sidebar-connect-text" style="font-size:11px;">Connect wallet & hold $INFINITE to keep access</div>
            <button class="btn-primary sidebar-connect-btn" onclick="openWalletConnect()" style="margin-top:8px;">Connect Wallet</button>
          </div>
        ` : hasKey ? `
          <div class="sidebar-usage" id="sidebarUsage">
            <div class="sidebar-usage-header">
              <span class="sidebar-usage-label">API Usage</span>
              <span class="sidebar-usage-count">${STATE.usage.limit === 0 ? '...' : STATE.usage.remaining.toLocaleString() + ' left'}</span>
            </div>
            <div class="sidebar-usage-track">
              <div class="sidebar-usage-fill ${usageBarClass}" style="width: ${usagePct}%"></div>
            </div>
            <div class="sidebar-usage-reset">resets ${resetTime}</div>
          </div>
          <div class="wallet-info" id="sidebarFooterInfo">${STATE.tier ? STATE.tier + ' Tier' : 'Loading...'} \u2014 ${(STATE.balance ?? 0).toLocaleString()} $INF</div>
          <div class="wallet-addr" onclick="copyText('${STATE.wallet}')">
            ${STATE.wallet ? STATE.wallet.slice(0, 6) + '...' + STATE.wallet.slice(-4) : '\u2014'}
            <span class="copy">COPY</span>
          </div>
          <div style="margin-top:8px;">
            <button class="btn-sm danger" style="width:100%;padding:8px;" onclick="disconnectWallet()">Disconnect</button>
          </div>
        ` : STATE.connected ? `
          <div class="wallet-info" id="sidebarFooterInfo">Connected \u2014 ${(STATE.balance ?? 0).toLocaleString()} $INF</div>
          <div class="wallet-addr" onclick="copyText('${STATE.wallet}')">
            ${STATE.wallet ? STATE.wallet.slice(0, 6) + '...' + STATE.wallet.slice(-4) : '\u2014'}
            <span class="copy">COPY</span>
          </div>
          <div style="margin-top:8px;">
            <button class="btn-sm danger" style="width:100%;padding:8px;" onclick="disconnectWallet()">Disconnect</button>
          </div>
        ` : `
          <div class="sidebar-connect-cta">
            <div class="sidebar-connect-text">Connect wallet & hold $INFINITE to unlock API keys</div>
            <button class="btn-primary sidebar-connect-btn" onclick="openWalletConnect()">Connect Wallet</button>
          </div>
        `}
        <div class="sidebar-socials">
          <a href="https://x.com/infinitexkeys" target="_blank" rel="noopener" class="sidebar-social-link">X / Twitter</a>
          <a href="https://discord.gg/infinite" target="_blank" rel="noopener" class="sidebar-social-link">Discord</a>
        </div>
        <div class="compliance-badge" title="INFINITE operates in full compliance with Anthropic, Google, and OpenAI usage policies. All API access is authorized and properly licensed.">
          <span class="compliance-dot"></span> ToS Compliant
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
    <div class="nav-group-label">Dashboard</div>
    <div class="nav-item ${t === 'overview' ? 'active' : ''}" data-tab="overview">Overview</div>
    <div class="nav-item ${t === 'keys' ? 'active' : ''}" data-tab="keys">API Keys</div>
    <div class="nav-item ${t === 'models' ? 'active' : ''}" data-tab="models">Models</div>
    <div class="nav-item ${t === 'connections' ? 'active' : ''}" data-tab="connections">Connections</div>
    <div class="nav-group-label">Solana Tools</div>
    <div class="nav-item ${t === 'launch' ? 'active' : ''}" data-tab="launch">Launch Token <span style="font-size:9px;opacity:0.5;margin-left:4px;">NEW</span></div>
    <div class="nav-item ${t === 'live-trades' ? 'active' : ''}" data-tab="live-trades">Live Trades</div>
    <div class="nav-item ${t === 'trading' ? 'active' : ''}" data-tab="trading">Trade Bot</div>
    <div class="nav-group-label">Media Tools</div>
    <div class="nav-item ${t === 'images' ? 'active' : ''}" data-tab="images">Image Lab</div>
    <div class="nav-item ${t === 'video' ? 'active' : ''}" data-tab="video">Video Lab</div>
    <div class="nav-group-label">Agents</div>
    <div class="nav-item ${t === 'chat' ? 'active' : ''}" data-tab="chat">AI Chat</div>
    <div class="nav-item ${t === 'my-agents' ? 'active' : ''}" data-tab="my-agents">My Agents</div>
    <div class="nav-item ${t === 'agents' ? 'active' : ''}" data-tab="agents">Tools Hub</div>
    <div class="nav-group-label">X Tools</div>
    <div class="nav-item ${t === 'x-tools' ? 'active' : ''}" data-tab="x-tools">Infinite Alpha <span style="font-size:9px;opacity:0.5;margin-left:4px;">(Beta)</span></div>
    <div class="nav-group-label">Protocol</div>
    <div class="nav-item ${t === 'future-apis' ? 'active' : ''}" data-tab="future-apis">Future APIs</div>
    <div class="nav-item ${t === 'treasury' ? 'active' : ''}" data-tab="treasury">Treasury</div>
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
      case 'keys': return renderKeys();
      case 'models': return renderModels();
      case 'connections': return renderConnections();
      case 'chat': return renderChat();
      case 'images': return renderImages();
      case 'video': return renderVideo();
      case 'live-trades': return renderLiveTrades();
      case 'trading': return renderTrading();
      case 'my-agents': return renderMyAgents();
      case 'agents': return renderAgents();
      case 'launch': return renderLaunch();
      case 'x-tools': return renderXTools();
      case 'future-apis': return renderFutureApis();
      case 'treasury': return renderTreasury();
      default: return renderOverview();
    }
  } catch (err) {
    console.error(`[INFINITE] Tab render error (${STATE.activeTab}):`, err);
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
