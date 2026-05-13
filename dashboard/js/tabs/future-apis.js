// ═══════════════════════════════════════════
// Meterflow Dashboard - Tab: Integrations
// ═══════════════════════════════════════════

// Real brand logos pulled from each company's official site
const LOGO_DOMAINS = {
  helius: 'helius.dev',
  jupiter: 'jup.ag',
  phantom: 'phantom.com',
  coingecko: 'coingecko.com',
  webhooks: 'meterflow.fun',
};

function logoFor(id) {
  const domain = LOGO_DOMAINS[id];
  if (!domain) return '';
  // DuckDuckGo serves the real, high-quality brand favicon from each site
  // Falls back to Google's favicon service if DDG fails
  const initial = (id || '?').charAt(0).toUpperCase();
  return `
    <img
      src="https://icons.duckduckgo.com/ip3/${domain}.ico"
      alt="${id}"
      loading="lazy"
      onerror="this.onerror=null;this.src='https://www.google.com/s2/favicons?domain=${domain}&sz=128';this.onerror=function(){this.style.display='none';this.parentElement.dataset.fallback='${initial}';};"
    >
  `;
}

const INTEGRATIONS = [
  { id: 'helius', name: 'Helius', category: 'Solana Infrastructure', status: 'active', description: 'RPC, DAS, webhooks, and transaction parsing for metered Solana routes.', features: ['RPC', 'DAS', 'Webhooks', 'Parsing'], website: 'https://helius.dev' },
  { id: 'jupiter', name: 'Jupiter', category: 'Payments & Routing', status: 'active', description: 'Quotes, swaps, token metadata, and route intelligence for paid agent workflows.', features: ['Quotes', 'Swaps', 'Tokens', 'Routing'], website: 'https://jup.ag' },
  { id: 'phantom', name: 'Phantom', category: 'Wallets', status: 'active', description: 'Wallet connection, signing, and operator identity for client key and budget setup.', features: ['Wallet Connect', 'Signing', 'Identity', 'Approval'], website: 'https://phantom.com' },
  { id: 'coingecko', name: 'CoinGecko', category: 'Market Data', status: 'active', description: 'Price, market, OHLCV, and pool data for agents that need paid market context.', features: ['Prices', 'OHLCV', 'Pools', 'Markets'], website: 'https://coingecko.com' },
  { id: 'webhooks', name: 'Meterflow Webhooks', category: 'Notifications', status: 'active', description: 'Signed delivery for receipts, verified payments, failed payments, budget exhaustion, and test events.', features: ['Signed Events', 'Retries', 'Receipts', 'Budgets'], website: 'https://meterflow.fun/docs' },
];

const CATEGORIES = ['All', 'Solana Infrastructure', 'Payments & Routing', 'Wallets', 'Market Data', 'Notifications'];

let selectedCategory = 'All';

export function renderFutureApis() {
  const filtered = selectedCategory === 'All'
    ? INTEGRATIONS
    : INTEGRATIONS.filter(item => item.category === selectedCategory);

  return `
    <div class="page-header">
      <h1 class="page-title">Integrations</h1>
      <p class="page-sub">Provider, wallet, data, and notification connections that attach to Meterflow meters and budget policies.</p>
    </div>
    <div class="stats-row">
      <div class="stat-card"><div class="label">Connected</div><div class="value accent">${INTEGRATIONS.length}</div><div class="sub">integration profiles</div></div>
      <div class="stat-card"><div class="label">Categories</div><div class="value">${CATEGORIES.length - 1}</div><div class="sub">provider classes</div></div>
      <div class="stat-card"><div class="label">State</div><div class="value green">Active</div><div class="sub">ready for meters</div></div>
      <div class="stat-card"><div class="label">Alerts</div><div class="value">On</div><div class="sub">operator notifications</div></div>
    </div>
    <div class="future-apis-note">
      <strong>How integrations work:</strong> attach a provider to a service route, set the billing unit and wallet policy, then use receipts to audit every paid call.
    </div>
    <div class="future-apis-tabs">
      ${CATEGORIES.map(cat => `
        <button class="future-apis-tab ${selectedCategory === cat ? 'active' : ''}" onclick="filterApiCategory('${cat}')">${cat}</button>
      `).join('')}
    </div>
    ${filtered.length === 0 ? `
      <div class="empty-state">
        <div class="empty-state-icon">∅</div>
        <div class="empty-state-title">No integrations in <em>${selectedCategory}</em></div>
        <div class="empty-state-desc">More providers coming soon. Reset the filter to see what's connected today.</div>
        <button class="btn-sm primary" onclick="filterApiCategory('All')">Show all integrations</button>
      </div>
    ` : ''}
    <div class="future-apis-grid">
      ${filtered.map(item => `
        <div class="api-card">
          <div class="api-card-logo">${logoFor(item.id)}</div>
          <div class="api-card-content">
            <div class="api-card-header">
              <div class="api-card-name">${item.name}</div>
              <div class="api-card-category">${item.category}</div>
            </div>
            <div class="api-card-desc">${item.description}</div>
            <div class="api-card-features">
              ${item.features.map(feature => `<span class="api-card-feature">${feature}</span>`).join('')}
            </div>
            <div class="api-card-footer">
              <a href="${item.website}" target="_blank" rel="noopener" class="api-card-link">${item.website.replace('https://', '')}</a>
              <span class="connection-status connected">${item.status}</span>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

export function filterApiCategory(category) {
  selectedCategory = category;
  import('../render.js').then(m => m.switchTabInPlace('future-apis'));
}

window.filterApiCategory = filterApiCategory;
