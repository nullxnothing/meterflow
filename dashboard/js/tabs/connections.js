// ═══════════════════════════════════════════
// INFINITE Dashboard - Tab: Connections
// ═══════════════════════════════════════════

import { STATE } from '../state.js';
import { api } from '../api.js';
import { render } from '../render.js';
import { showToast } from '../actions.js';

export function renderConnections() {
  const providers = [
    { id: 'github', name: 'GitHub', desc: 'Access private repos, issues, and PRs', icon: 'GH', ready: true },
    { id: 'google', name: 'Google', desc: 'Search Drive, read Docs and Sheets', icon: 'G', ready: false },
    { id: 'notion', name: 'Notion', desc: 'Search pages and query databases', icon: 'N', ready: false },
  ];

  return `
    <div class="page-header">
      <h1 class="page-title">Connections</h1>
      <p class="page-sub">Connect your accounts to let the AI access your private data</p>
    </div>
    <div class="connections-grid">
      ${providers.map(p => {
        const isConnected = STATE.connections[p.id];
        return `
          <div class="card connection-card${!p.ready ? ' coming-soon' : ''}">
            <div class="connection-icon">${p.icon}</div>
            <div class="connection-info">
              <div class="connection-name">${p.name}</div>
              <div class="connection-desc dim">${p.desc}</div>
            </div>
            <div class="connection-action">
              ${!p.ready
                ? '<span class="connection-status coming-soon-label">Coming Soon</span>'
                : isConnected
                  ? `<span class="connection-status connected">Connected</span>
                     <button class="btn-sm danger" onclick="disconnectOAuth('${p.id}')">Disconnect</button>`
                  : `<button class="btn-sm primary" onclick="connectOAuth('${p.id}')">Connect</button>`
              }
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div class="section" style="margin-top:32px;">
      <div class="section-title">How it works</div>
      <div class="dim" style="max-width:600px;line-height:1.6;">
        When you connect an account, the AI chat can access your private data through that service's API.
        Your OAuth tokens are stored in-memory on the server and tied to your API key.
        You can disconnect at any time.
      </div>
    </div>
  `;
}

export async function connectOAuth(provider) {
  try {
    const data = await api('/oauth/' + provider + '/init', { method: 'POST' });
    if (data.url) window.open(data.url, '_blank', 'width=600,height=700');
  } catch (err) {
    showToast(err.message || 'Failed to start OAuth', true);
  }
}

export async function disconnectOAuth(provider) {
  try {
    await api('/oauth/' + provider + '/disconnect', { method: 'POST' });
    STATE.connections[provider] = false;
    render();
    showToast(provider + ' disconnected');
  } catch (err) {
    showToast(err.message || 'Failed to disconnect', true);
  }
}

// Attach to window for onclick handlers
window.connectOAuth = connectOAuth;
window.disconnectOAuth = disconnectOAuth;
