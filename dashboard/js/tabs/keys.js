// ═══════════════════════════════════════════
// INFINITE Dashboard - Tab: API Keys
// ═══════════════════════════════════════════

import { STATE } from '../state.js';
import { API_BASE } from '../api.js';
import { api } from '../api.js';
import { render } from '../render.js';
import { showToast } from '../actions.js';
import { isHolder, renderHolderGate } from '../gate.js';

export function renderKeys() {
  if (!isHolder()) {
    return `
      <div class="page-header">
        <h1 class="page-title">API Keys</h1>
        <p class="page-sub">Your key works as a drop-in replacement for Anthropic and Google API keys</p>
      </div>
      ${renderHolderGate('API keys')}
    `;
  }

  const displayKey = STATE.keyVisible ? STATE.apiKeyFull : STATE.apiKey;
  return `
    <div class="page-header">
      <h1 class="page-title">API Keys</h1>
      <p class="page-sub">Your key works as a drop-in replacement for Anthropic and Google API keys</p>
    </div>
    <div class="section">
      <div class="section-title">Your API Key</div>
      <div class="api-key-box">
        <div class="api-key-display">
          <div class="api-key-value" id="apiKeyDisplay">${displayKey || 'No key'}</div>
          <button class="btn-sm primary" onclick="copyText('${STATE.apiKeyFull || ''}')">Copy</button>
        </div>
        <div class="api-key-actions">
          <button class="btn-sm" onclick="toggleKeyVisibility()">${STATE.keyVisible ? 'Hide' : 'Show'}</button>
          <button class="btn-sm" onclick="rotateKey()">Rotate Key</button>
          <button class="btn-sm danger" onclick="revokeKey()">Revoke</button>
        </div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Quick Start</div>
      <div class="api-key-box">
        <div class="api-key-hint" style="margin-bottom:16px;">Use your INFINITE API key exactly like you'd use a Claude or Gemini key. Just point to our endpoint:</div>
        <div class="api-key-value" style="font-size:12px;line-height:1.8;white-space:pre-wrap;margin-bottom:16px;padding:20px;">
<span style="color:var(--text-muted)">// Works with any HTTP client</span>
<span style="color:var(--blue)">curl</span> ${API_BASE}/v1/chat \\
  -H <span style="color:var(--accent)">"Authorization: Bearer ${STATE.keyVisible ? STATE.apiKeyFull : 'inf_your_key'}"</span> \\
  -d <span style="color:var(--accent)">'{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"Hello"}]}'</span></div>
        <div class="api-key-hint">
          <strong style="color:var(--text)">Anthropic Python SDK:</strong><br>
          <code>client = Anthropic(api_key="your_inf_key", base_url="${API_BASE}")</code>
        </div>
      </div>
    </div>
    ${renderXApiSection()}
  `;
}

function renderXApiSection() {
  const isArchitect = STATE.tier === 'Architect' || STATE.tier === 'Alpha';
  const isConnected = STATE.connections.twitter;

  if (!isArchitect) {
    return `
      <div class="section" style="margin-top:32px;">
        <div class="section-title">X / Twitter API</div>
        <div class="api-key-box" style="opacity:0.5;">
          <div class="api-key-hint">Access the X API through your INFINITE key. Search tweets, look up users, read timelines, and post.</div>
          <div style="margin-top:12px;"><span class="connection-status coming-soon-label">Architect Tier Required</span></div>
        </div>
      </div>
    `;
  }

  if (isConnected) {
    return `
      <div class="section" style="margin-top:32px;">
        <div class="section-title">X / Twitter API</div>
        <div class="api-key-box">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <div>
              <span class="connection-status connected">Connected</span>
              <span class="dim" style="margin-left:8px;font-size:12px;">Your key can access the X API</span>
            </div>
            <button class="btn-sm danger" onclick="disconnectTwitter()">Disconnect</button>
          </div>
          <div class="api-key-value" style="font-size:12px;line-height:1.8;white-space:pre-wrap;padding:20px;">
<span style="color:var(--text-muted)">// Search recent tweets</span>
<span style="color:var(--blue)">curl</span> -X POST ${API_BASE}/v1/twitter/search \\
  -H <span style="color:var(--accent)">"Authorization: Bearer ${STATE.keyVisible ? STATE.apiKeyFull : 'inf_your_key'}"</span> \\
  -H <span style="color:var(--accent)">"Content-Type: application/json"</span> \\
  -d <span style="color:var(--accent)">'{"query":"solana AI"}'</span>

<span style="color:var(--text-muted)">// Look up a user</span>
<span style="color:var(--blue)">curl</span> -X POST ${API_BASE}/v1/twitter/user \\
  -H <span style="color:var(--accent)">"Authorization: Bearer inf_your_key"</span> \\
  -d <span style="color:var(--accent)">'{"username":"infinitexkeys"}'</span></div>
          <div class="api-key-hint" style="margin-top:12px;">
            <strong style="color:var(--text)">Available actions:</strong> <code>me</code> <code>user</code> <code>search</code> <code>timeline</code> <code>tweet</code> <code>reply</code>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="section" style="margin-top:32px;">
      <div class="section-title">X / Twitter API</div>
      <div class="api-key-box">
        <div class="api-key-hint" style="margin-bottom:16px;">Want your API key to access <strong style="color:var(--text)">X / Twitter</strong>? Connect your account or paste a Bearer Token to enable tweet search, user lookup, timelines, and posting through your INFINITE key.</div>
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;">
          <button class="btn-sm primary" onclick="connectOAuth('twitter')">Connect X Account</button>
          <span class="dim" style="font-size:12px;">via OAuth 2.0</span>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:16px;">
          <div class="api-key-hint" style="margin-bottom:8px;">Or paste your own Bearer Token:</div>
          <div style="display:flex;gap:8px;">
            <input type="password" id="twitterByokInput" placeholder="Bearer Token" style="flex:1;padding:8px 12px;font-size:13px;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:var(--font-mono);">
            <button class="btn-sm primary" onclick="submitTwitterByok()">Save</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function disconnectTwitter() {
  try {
    await api('/oauth/twitter/disconnect', { method: 'POST' });
    STATE.connections.twitter = false;
    render();
    showToast('X disconnected');
  } catch (err) {
    showToast(err.message || 'Failed to disconnect', true);
  }
}

async function submitTwitterByok() {
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

window.disconnectTwitter = disconnectTwitter;
window.submitTwitterByok = submitTwitterByok;
