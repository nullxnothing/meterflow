// ═══════════════════════════════════════════
// Meterflow Dashboard - Tab: API Keys
// ═══════════════════════════════════════════

import { STATE } from '../state.js';
import { API_BASE } from '../state.js';
import { canManageMeterflow, renderPreviewNotice } from '../gate.js?v=preview-link-2';

export function renderKeys() {
  const locked = !canManageMeterflow();

  const displayKey = locked
    ? 'mf_preview_live_key_********************************'
    : (STATE.keyVisible ? STATE.apiKeyFull : STATE.apiKey);
  return `
    <div class="page-header">
      <h1 class="page-title">API Keys</h1>
      <p class="page-sub">Use keys as metered clients for meters, receipts, budgets, MCP tools, and hosted provider routes.</p>
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
        <div class="api-key-hint">Use your Meterflow key to create hosted meters, inspect receipts, configure budgets, and package MCP tools.</div>
        <div class="api-key-value api-key-snippet">
<span class="code-muted">// Works with any HTTP client</span>
<span class="code-command">curl</span> ${API_BASE}/v1/meters \\
  -H <span class="code-accent">"Authorization: Bearer ${STATE.keyVisible ? STATE.apiKeyFull : 'mf_your_key'}"</span> \\
  -H <span class="code-accent">"Content-Type: application/json"</span> \\
  -d <span class="code-accent">'{"targetUrl":"https://api.example.com","method":"GET","unit":"lookup","priceUsd":0.01}'</span></div>
        <div class="api-key-hint">
          <strong>Next step:</strong><br>
          <code>POST ${API_BASE}/v1/meters/:id/test</code>
        </div>
      </div>
    </div>
  `;
}
