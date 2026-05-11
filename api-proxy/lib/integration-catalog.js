export const INTEGRATION_CATALOG = Object.freeze([
  { id: 'helius', name: 'Helius', category: 'solana-data', priority: 'highest', status: 'planned', why: 'Meter RPC, DAS, webhooks, enriched wallet data, token metadata, and LaserStream-powered data without exposing provider keys.', exampleRoutes: ['/v1/helius/das', '/v1/helius/wallet-labels', '/v1/helius/token-metadata'] },
  { id: 'jupiter', name: 'Jupiter', category: 'trading-routing', priority: 'highest', status: 'planned', why: 'Let agents pay for swap route analysis, liquidity checks, token preflight, and execution-adjacent decision support.', exampleRoutes: ['/v1/jupiter/quote-analysis', '/v1/jupiter/liquidity-health', '/v1/jupiter/token-precheck'] },
  { id: 'pyth', name: 'Pyth', category: 'oracle-risk', priority: 'high', status: 'planned', why: 'Price, volatility, and oracle health routes make Meterflow useful for risk engines, perps agents, and liquidation monitors.', exampleRoutes: ['/v1/pyth/price-check', '/v1/pyth/oracle-health', '/v1/pyth/volatility'] },
  { id: 'drift', name: 'Drift', category: 'perps', priority: 'high', status: 'planned', why: 'Perps builders need paid endpoints for funding, position risk, vault strategy scoring, and liquidation monitoring.', exampleRoutes: ['/v1/drift/position-risk', '/v1/drift/funding-analysis', '/v1/drift/vault-score'] },
  { id: 'jito', name: 'Jito', category: 'transaction-optimization', priority: 'high', status: 'planned', why: 'Paid endpoints for bundle simulation, priority fee recommendations, and execution optimization are natural agent tools.', exampleRoutes: ['/v1/jito/bundle-sim', '/v1/jito/priority-fee', '/v1/jito/execution-check'] },
  { id: 'squads', name: 'Squads', category: 'team-wallets', priority: 'high', status: 'planned', why: 'Teams need multisig-controlled provider wallets, treasury-owned budgets, and approval flows for high-spend agents.', exampleRoutes: ['/v1/squads/team-budget', '/v1/squads/provider-wallet', '/v1/squads/approval-policy'] },
  { id: 'phantom-backpack-solflare', name: 'Wallet UX', category: 'wallets', priority: 'high', status: 'planned', why: 'Budget approval, revocation, and receipt views should feel wallet-native for humans supervising agents.', exampleRoutes: ['/v1/wallets/budget-approval', '/v1/wallets/receipt-view', '/v1/wallets/revoke-agent'] },
  { id: 'dialect-telegram-discord', name: 'Notifications', category: 'alerts', priority: 'medium', status: 'planned', why: 'Budget exhausted, payment failed, blocked route, and provider revenue alerts should reach builders where they work.', exampleRoutes: ['/v1/alerts/budget-exhausted', '/v1/alerts/payment-failed', '/v1/alerts/revenue-milestone'] },
  { id: 'metaplex', name: 'Metaplex', category: 'nft-media-data', priority: 'medium', status: 'planned', why: 'NFT metadata, compressed asset lookups, collection intelligence, and creator analytics can become paid routes.', exampleRoutes: ['/v1/metaplex/collection-health', '/v1/metaplex/asset-lookup', '/v1/metaplex/creator-analytics'] },
  { id: 'light-protocol', name: 'Light Protocol', category: 'compression', priority: 'medium', status: 'planned', why: 'Compressed account/data workflows matter for high-volume agents and low-cost state interactions.', exampleRoutes: ['/v1/light/compressed-lookup', '/v1/light/account-proof', '/v1/light/state-read'] },
  { id: 'streamflow', name: 'Streamflow', category: 'payouts', priority: 'medium', status: 'planned', why: 'Provider revenue can be routed into streams for teams, contributors, and tool creators.', exampleRoutes: ['/v1/streamflow/provider-payout', '/v1/streamflow/revenue-stream', '/v1/streamflow/split-config'] },
]);

export function listIntegrationCatalog(filters = {}) {
  return INTEGRATION_CATALOG
    .filter(item => !filters.category || item.category === filters.category)
    .filter(item => !filters.priority || item.priority === filters.priority)
    .filter(item => !filters.status || item.status === filters.status)
    .map(item => ({ ...item, exampleRoutes: [...item.exampleRoutes] }));
}

export function getIntegration(id) {
  const item = INTEGRATION_CATALOG.find(integration => integration.id === id);
  return item ? { ...item, exampleRoutes: [...item.exampleRoutes] } : null;
}
