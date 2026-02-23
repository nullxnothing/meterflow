// ═══════════════════════════════════════════
// INFINITE Dashboard - Tab: Connections
// ═══════════════════════════════════════════

import { STATE } from '../state.js';
import { api } from '../api.js';
import { render } from '../render.js';
import { showToast } from '../actions.js';
import { isHolder, renderHolderGate } from '../gate.js';

export function renderConnections() {
  if (!isHolder()) {
    return `
      <div class="page-header">
        <h1 class="page-title">Connections</h1>
        <p class="page-sub">Connect your accounts to let the AI access your private data</p>
      </div>
      ${renderHolderGate('Connections')}
    `;
  }

  const isArchitect = STATE.tier === 'Architect';
  const providers = [
    { id: 'github', name: 'GitHub', desc: 'Access private repos, issues, and PRs', icon: 'GH', ready: true },
    { id: 'twitter', name: 'X / Twitter', desc: 'Search tweets, read timelines, post tweets', icon: '𝕏', ready: true, tierGated: true },
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
        const isLocked = p.tierGated && !isArchitect;
        return `
          <div class="card connection-card${!p.ready || isLocked ? ' coming-soon' : ''}">
            <div class="connection-icon">${p.icon}</div>
            <div class="connection-info">
              <div class="connection-name">${p.name}</div>
              <div class="connection-desc dim">${p.desc}</div>
            </div>
            <div class="connection-action">
              ${isLocked
                ? '<span class="connection-status coming-soon-label">Architect Only</span>'
                : !p.ready
                  ? '<span class="connection-status coming-soon-label">Coming Soon</span>'
                  : isConnected
                    ? `<span class="connection-status connected">Connected</span>
                       <button class="btn-sm danger" onclick="disconnectOAuth('${p.id}')">Disconnect</button>`
                    : `<button class="btn-sm primary" onclick="connectOAuth('${p.id}')">Connect</button>`
              }
            </div>
          </div>
          ${p.id === 'twitter' && !isConnected && !isLocked ? `
            <div class="card connection-card" style="margin-top:-8px;padding:16px 24px;border-top:none;border-top-left-radius:0;border-top-right-radius:0;">
              <div class="connection-info" style="width:100%;">
                <div class="connection-desc dim" style="margin-bottom:8px;">Or paste your own X API Bearer Token:</div>
                <div style="display:flex;gap:8px;">
                  <input type="password" id="twitterByokInput" placeholder="Bearer Token" style="flex:1;padding:8px 12px;font-size:13px;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:var(--font-mono);">
                  <button class="btn-sm primary" onclick="submitTwitterByok()">Save</button>
                </div>
              </div>
            </div>
          ` : ''}
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

export async function submitTwitterByok() {
  const input = document.getElementById('twitterByokInput');
  if (!input || !input.value.trim()) {
    showToast('Enter a Bearer Token', true);
    return;
  }

  try {
    await api('/oauth/twitter/byok', {
      method: 'POST',
      body: JSON.stringify({ token: input.value.trim() }),
    });
    STATE.connections.twitter = true;
    render();
    showToast('X Bearer Token saved');
  } catch (err) {
    showToast(err.message || 'Failed to save token', true);
  }
}

// Attach to window for onclick handlers
window.connectOAuth = connectOAuth;
window.disconnectOAuth = disconnectOAuth;
window.submitTwitterByok = submitTwitterByok;
