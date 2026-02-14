// ═══════════════════════════════════════════
// INFINITE Dashboard - Tab: API Keys
// ═══════════════════════════════════════════

import { STATE } from '../state.js';
import { API_BASE } from '../api.js';

export function renderKeys() {
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
  -d <span style="color:var(--accent)">'{"model":"claude-sonnet-4-5-20250929","messages":[{"role":"user","content":"Hello"}]}'</span></div>
        <div class="api-key-hint">
          <strong style="color:var(--text)">Anthropic Python SDK:</strong><br>
          <code>client = Anthropic(api_key="your_inf_key", base_url="${API_BASE}")</code>
        </div>
      </div>
    </div>
  `;
}
