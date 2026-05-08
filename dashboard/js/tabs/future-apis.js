// ═══════════════════════════════════════════
// Meterflow Dashboard - Tab: Integrations
// ═══════════════════════════════════════════

const INTEGRATIONS = [
  { id: 'helius', name: 'Helius', category: 'Solana Infrastructure', status: 'active', description: 'RPC, DAS, webhooks, and transaction parsing for metered Solana routes.', features: ['RPC', 'DAS', 'Webhooks', 'Parsing'], website: 'https://helius.dev' },
  { id: 'jupiter', name: 'Jupiter', category: 'Payments & Routing', status: 'active', description: 'Quotes, swaps, token metadata, and route intelligence for paid agent workflows.', features: ['Quotes', 'Swaps', 'Tokens', 'Routing'], website: 'https://jup.ag' },
  { id: 'phantom', name: 'Phantom', category: 'Wallets', status: 'active', description: 'Wallet connection, signing, and operator identity for client key and budget setup.', features: ['Wallet Connect', 'Signing', 'Identity', 'Approval'], website: 'https://phantom.com' },
  { id: 'x', name: 'X API', category: 'Social Data', status: 'active', description: 'Social search and account intelligence routes that can be sold as metered data products.', features: ['Search', 'Profiles', 'Timelines', 'Posting'], website: 'https://developer.x.com' },
  { id: 'coingecko', name: 'CoinGecko', category: 'Market Data', status: 'active', description: 'Price, market, OHLCV, and pool data for agents that need paid market context.', features: ['Prices', 'OHLCV', 'Pools', 'Markets'], website: 'https://coingecko.com' },
  { id: 'discord', name: 'Discord', category: 'Notifications', status: 'active', description: 'Operator alerts for budget exhaustion, failed payments, new route requests, and spend spikes.', features: ['Alerts', 'Webhooks', 'Bots', 'Approvals'], website: 'https://discord.com/developers' },
];

const CATEGORIES = ['All', 'Solana Infrastructure', 'Payments & Routing', 'Wallets', 'Social Data', 'Market Data', 'Notifications'];

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
      <strong style="color:var(--accent)">How integrations work:</strong> attach a provider to a service route, set the billing unit and wallet policy, then use receipts to audit every paid call.
    </div>
    <div class="future-apis-tabs">
      ${CATEGORIES.map(cat => `
        <button class="future-apis-tab ${selectedCategory === cat ? 'active' : ''}" onclick="filterApiCategory('${cat}')">${cat}</button>
      `).join('')}
    </div>
    <div class="future-apis-grid">
      ${filtered.map(item => `
        <div class="api-card">
          <div class="api-card-logo">
            <div style="width:48px;height:48px;background:rgba(79,156,255,0.12);border:1px solid var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--accent);font-size:18px;">${item.name.charAt(0)}</div>
          </div>
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
