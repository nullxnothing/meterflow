// ═══════════════════════════════════════════
// Meterflow Dashboard - Tab: API Keys
// ═══════════════════════════════════════════

import { STATE } from '../state.js';
import { API_BASE } from '../state.js';
import { canManageMeterflow, renderPreviewNotice } from '../gate.js';

export function renderKeys() {
  const locked = !canManageMeterflow();

  const displayKey = locked
    ? 'mf_preview_live_key_********************************'
    : (STATE.keyVisible ? STATE.apiKeyFull : STATE.apiKey);
  return `
    <div class="page-header">
      <h1 class="page-title">API Keys</h1>
      <p class="page-sub">Use keys as metered clients for model routes today and payment-verified endpoints as they ship.</p>
    </div>
    ${locked ? renderPreviewNotice('API keys') : ''}
    <div class="section">
      <div class="section-title">Your API Key</div>
      <div class="api-key-box">
        <div class="api-key-display">
          <div class="api-key-value" id="apiKeyDisplay">${displayKey || 'No key'}</div>
          <button class="btn-sm primary" onclick="${locked ? 'openTokenPurchase()' : `copyText('${STATE.apiKeyFull || ''}')`}">${locked ? 'Unlock' : 'Copy'}</button>
        </div>
        <div class="api-key-actions ${locked ? 'preview-disabled' : ''}">
          <button class="btn-sm" onclick="toggleKeyVisibility()">${STATE.keyVisible ? 'Hide' : 'Show'}</button>
          <button class="btn-sm" onclick="rotateKey()">Rotate Key</button>
          <button class="btn-sm danger" onclick="revokeKey()">Revoke</button>
        </div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Quick Start</div>
      <div class="api-key-box">
        <div class="api-key-hint" style="margin-bottom:16px;">Use your Meterflow key like a model gateway key today. Meterflow records usage so the same client can move to priced endpoints, budgets, and receipts.</div>
        <div class="api-key-value" style="font-size:12px;line-height:1.8;white-space:pre-wrap;margin-bottom:16px;padding:20px;">
<span style="color:var(--text-muted)">// Works with any HTTP client</span>
<span style="color:var(--blue)">curl</span> ${API_BASE}/v1/chat \\
  -H <span style="color:var(--accent)">"Authorization: Bearer ${STATE.keyVisible ? STATE.apiKeyFull : 'mf_your_key'}"</span> \\
  -d <span style="color:var(--accent)">'{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"Hello"}]}'</span></div>
        <div class="api-key-hint">
          <strong style="color:var(--text)">Compatible client example:</strong><br>
          <code>client = Anthropic(api_key="your_mf_key", base_url="${API_BASE}")</code>
        </div>
      </div>
    </div>
  `;
}
