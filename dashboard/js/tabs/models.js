// ═══════════════════════════════════════════
// Meterflow Dashboard - Tab: Service Routes
// ═══════════════════════════════════════════

import { STATE } from '../state.js';

export function renderModels() {
  const allModels = [
    { name: 'claude-sonnet-4-6', provider: 'Anthropic', tier: 'Signal+', live: true },
    { name: 'claude-opus-4-6', provider: 'Anthropic', tier: 'Architect', live: true },
    { name: 'gemini-2.5-pro', provider: 'Google', tier: 'Operator+', live: true },
    { name: 'gemini-2.5-flash', provider: 'Google', tier: 'Signal+', live: true },
    { name: 'gpt-4o', provider: 'OpenAI', tier: 'Operator+', live: true },
    { name: 'gpt-4o-mini', provider: 'OpenAI', tier: 'Signal+', live: true },
  ];
  const userModels = STATE.models || [];
  return `
    <div class="page-header">
      <h1 class="page-title">Service Routes</h1>
      <p class="page-sub">Bundled provider routes that can become first-class meters with route-level prices, limits, and receipts.</p>
    </div>
    <div class="section">
      <div class="section-title">Model Routes</div>
      <div class="models-list">
        <div class="model-row model-header-row">
          <div class="model-name" style="color:var(--text-muted);font-size:10px;letter-spacing:2px;">ROUTE</div>
          <div class="model-provider" style="font-size:10px;letter-spacing:2px;">PROVIDER</div>
          <div class="model-tier" style="font-size:10px;letter-spacing:2px;">ACCESS</div>
          <div class="model-status" style="font-size:10px;letter-spacing:2px;">STATUS</div>
        </div>
        ${allModels.map(m => {
          const hasAccess = userModels.some(um => um.includes(m.name.split('-')[0]));
          return `<div class="model-row" style="${hasAccess ? '' : 'opacity:0.4'}">
            <div class="model-name">${m.name}</div>
            <div class="model-provider"><span class="model-mobile-label">Provider: </span>${m.provider}</div>
            <div class="model-tier"><span class="model-mobile-label">Access: </span>${m.tier}</div>
            <div class="model-status">${hasAccess ? '<span class="live">LIVE</span>' : '<span style="color:var(--text-muted)">LOCKED</span>'}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}
