// ═══════════════════════════════════════════
// INFINITE Dashboard - Tab: Models
// ═══════════════════════════════════════════

import { STATE } from '../state.js';

export function renderModels() {
  const allModels = [
    { name: 'claude-sonnet-4-5', provider: 'Anthropic', tier: 'Signal+', live: true },
    { name: 'claude-opus-4-6', provider: 'Anthropic', tier: 'Architect', live: true },
    { name: 'gemini-2.5-pro', provider: 'Google', tier: 'Operator+', live: true },
    { name: 'gemini-2.5-flash', provider: 'Google', tier: 'Signal+', live: true },
  ];
  const userModels = STATE.models || [];
  return `
    <div class="page-header">
      <h1 class="page-title">Available Models</h1>
      <p class="page-sub">Access depends on your tier. Upgrade by holding more $INFINITE.</p>
    </div>
    <div class="section">
      <div class="section-title">AI Models</div>
      <div class="models-list">
        <div class="model-row" style="background:transparent;border-color:transparent;">
          <div class="model-name" style="color:var(--text-muted);font-size:10px;letter-spacing:2px;">MODEL</div>
          <div class="model-provider" style="font-size:10px;letter-spacing:2px;">PROVIDER</div>
          <div class="model-tier" style="font-size:10px;letter-spacing:2px;">MIN TIER</div>
          <div class="model-status" style="font-size:10px;letter-spacing:2px;">STATUS</div>
        </div>
        ${allModels.map(m => {
          const hasAccess = userModels.some(um => um.includes(m.name.split('-')[0]));
          return `<div class="model-row" style="${hasAccess ? '' : 'opacity:0.4'}">
            <div class="model-name">${m.name}</div>
            <div class="model-provider">${m.provider}</div>
            <div class="model-tier">${m.tier}</div>
            <div class="model-status">${hasAccess ? '<span class="live">LIVE</span>' : '<span style="color:var(--text-muted)">LOCKED</span>'}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}
