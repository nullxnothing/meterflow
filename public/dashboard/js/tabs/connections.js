// ═══════════════════════════════════════════
// Meterflow Dashboard - Tab: Connections
// ═══════════════════════════════════════════

import { STATE } from '../state.js';
import { api } from '../api.js';
import { render } from '../render.js';
import { showToast } from '../actions.js';
import { canManageMeterflow, renderPreviewNotice } from '../gate.js?v=preview-link-2';

export function renderConnections() {
  const locked = !canManageMeterflow();

  const providers = [
    { id: 'github', name: 'GitHub', desc: 'Access private repos, issues, and PRs', domain: 'github.com', ready: true },
    { id: 'google', name: 'Google', desc: 'Search Drive, read Docs and Sheets', domain: 'google.com', ready: false },
    { id: 'notion', name: 'Notion', desc: 'Search pages and query databases', domain: 'notion.so', ready: false },
  ];

  return `
    <div class="page-header">
      <h1 class="page-title">Connections</h1>
      <p class="page-sub">Attach provider accounts to meters, service routes, and private agent tools.</p>
    </div>
    ${locked ? renderPreviewNotice('connections') : ''}
    <div class="connections-grid">
      ${providers.map(p => {
        const isConnected = STATE.connections[p.id];
        return `
          <div class="card connection-card${!p.ready ? ' provider-setup' : ''}">
            <div class="connection-icon">
              <img src="https://icons.duckduckgo.com/ip3/${p.domain}.ico" alt="${p.name}" loading="lazy" onerror="this.onerror=null;this.src='https://www.google.com/s2/favicons?domain=${p.domain}&sz=128';this.onerror=function(){this.style.display='none';};">
            </div>
            <div class="connection-info">
              <div class="connection-name">${p.name}</div>
              <div class="connection-desc dim">${p.desc}</div>
            </div>
            <div class="connection-action">
              ${!p.ready
                ? '<span class="connection-status coming-soon-label">Provider Setup</span>'
                : isConnected
                  ? `<span class="connection-status connected">Connected</span>
                     <button class="btn-sm danger" onclick="disconnectOAuth('${p.id}')">Disconnect</button>`
                  : `<button class="btn-sm primary" onclick="${locked ? 'openTokenPurchase()' : `connectOAuth('${p.id}')`}">${locked ? 'Unlock' : 'Connect'}</button>`
              }
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div class="section u-mt-8">
      <div class="section-title">How it works</div>
      <div class="dim u-copy-measure">
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
