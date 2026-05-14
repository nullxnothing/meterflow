// ═══════════════════════════════════════════
// Meterflow Dashboard - Tab: Service Routes
// ═══════════════════════════════════════════

import { STATE } from '../state.js';

const PROVIDER_DOMAINS = {
  Anthropic: 'anthropic.com',
  Google: 'google.com',
  OpenAI: 'openai.com',
};

function providerLogo(provider) {
  const domain = PROVIDER_DOMAINS[provider] || '';
  if (!domain) return '';
  return `<img src="https://icons.duckduckgo.com/ip3/${domain}.ico" alt="" loading="lazy" onerror="this.style.display='none'">`;
}

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
          return `<div class="model-row${hasAccess ? '' : ' is-locked'}">
            <div class="model-name">${m.name}</div>
            <div class="model-provider">
              <span class="model-mobile-label">Provider: </span>
              <span class="provider-cell"><span class="provider-logo">${providerLogo(m.provider)}</span>${m.provider}</span>
            </div>
            <div class="model-tier"><span class="model-mobile-label">Access: </span><span class="tier-pill">${m.tier}</span></div>
            <div class="model-status">${hasAccess ? '<span class="status-pill live">Live</span>' : '<span class="status-pill locked">Locked</span>'}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}
