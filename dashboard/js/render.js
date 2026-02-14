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
import { renderFutureApis } from './tabs/future-apis.js';
import { renderTreasury } from './tabs/treasury.js';

export function render() {
  const app = document.getElementById('app');
  app.className = STATE.connected ? 'app' : 'app connect-mode';
  app.innerHTML = STATE.connected ? renderDashboard() : renderConnectScreen();
  bindEvents();
}

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
          ${STATE.connecting ? `<div class="connect-btn" style="opacity:0.6;cursor:wait;">Connecting...</div>` : hasWallet ? providers.map((p, i) => `
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
  return `
    <aside class="sidebar">
      <div class="sidebar-logo">INFINITE</div>
      <nav class="sidebar-nav">
        <div class="nav-group-label">Dashboard</div>
        <div class="nav-item ${STATE.activeTab === 'overview' ? 'active' : ''}" data-tab="overview">Overview</div>
        <div class="nav-item ${STATE.activeTab === 'keys' ? 'active' : ''}" data-tab="keys">API Keys</div>
        <div class="nav-item ${STATE.activeTab === 'models' ? 'active' : ''}" data-tab="models">Models</div>
        <div class="nav-item ${STATE.activeTab === 'connections' ? 'active' : ''}" data-tab="connections">Connections</div>
        <div class="nav-group-label">Tools</div>
        <div class="nav-item ${STATE.activeTab === 'chat' ? 'active' : ''}" data-tab="chat">AI Chat</div>
        <div class="nav-item ${STATE.activeTab === 'images' ? 'active' : ''}" data-tab="images">Image Lab</div>
        <div class="nav-item ${STATE.activeTab === 'video' ? 'active' : ''}" data-tab="video">Video Lab</div>
        <div class="nav-item ${STATE.activeTab === 'trading' ? 'active' : ''}" data-tab="trading">Trade Bot</div>
        <div class="nav-item ${STATE.activeTab === 'agents' ? 'active' : ''}" data-tab="agents">Tools Hub</div>
        <div class="nav-group-label">Protocol</div>
        <div class="nav-item ${STATE.activeTab === 'future-apis' ? 'active' : ''}" data-tab="future-apis">Future APIs</div>
        <div class="nav-item ${STATE.activeTab === 'treasury' ? 'active' : ''}" data-tab="treasury">Treasury</div>
      </nav>
      <div class="sidebar-footer">
        <div class="wallet-info" id="sidebarFooterInfo">${STATE.tier || '—'} Tier — ${STATE.balance.toLocaleString()} $INF</div>
        <div class="wallet-addr" onclick="copyText('${STATE.wallet}')">
          ${STATE.wallet ? STATE.wallet.slice(0, 6) + '...' + STATE.wallet.slice(-4) : '—'}
          <span class="copy">COPY</span>
        </div>
        <div style="margin-top:8px;">
          <button class="btn-sm danger" style="width:100%;padding:8px;" onclick="disconnectWallet()">Disconnect</button>
        </div>
        <div class="sidebar-socials">
          <a href="https://x.com/infiniteonsol" target="_blank" rel="noopener" class="sidebar-social-link">X / Twitter</a>
          <a href="https://discord.gg/infinite" target="_blank" rel="noopener" class="sidebar-social-link">Discord</a>
        </div>
      </div>
    </aside>
    <main class="main${isChat ? ' chat-mode' : ''}">${renderTab()}</main>
  `;
}

export function renderTab() {
  switch (STATE.activeTab) {
    case 'overview': return renderOverview();
    case 'keys': return renderKeys();
    case 'models': return renderModels();
    case 'connections': return renderConnections();
    case 'chat': return renderChat();
    case 'images': return renderImages();
    case 'video': return renderVideo();
    case 'trading': return renderTrading();
    case 'agents': return renderAgents();
    case 'future-apis': return renderFutureApis();
    case 'treasury': return renderTreasury();
    default: return renderOverview();
  }
}
