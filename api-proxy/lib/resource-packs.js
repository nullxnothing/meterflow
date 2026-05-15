import { createBudget } from './control-plane.js';

const RESOURCE_PACKS = [
  {
    id: 'xona-agent-resources',
    slug: 'xona',
    name: 'Xona Agent Resources',
    provider: 'Xona',
    website: 'https://xona-agent.com/resources',
    summary: 'Policy-ready resource pack for Xona x402/MPP agent resources: creative generation, token intelligence, Solana market data, news, signals, and PumpFun movers.',
    rails: ['x402', 'mpp'],
    settlementAsset: 'USDC',
    policyDefaults: {
      mode: 'enforce',
      piiGuard: true,
      requireReceipt: true,
      allowedRails: ['x402', 'mpp'],
      dailyCapUsd: 10,
      perCallCapUsd: 0.5,
      approvalThresholdUsd: 0.5,
    },
    resources: [
      { id: 'xona-flux-2-pro', name: 'FLUX.2 Pro Image', category: 'creative', method: 'POST', endpoint: '/image/flux-2-pro', priceUsd: 0.05, rails: ['x402'], tags: ['image', 'generation'] },
      { id: 'xona-flux-2-max', name: 'FLUX.2 Max Image', category: 'creative', method: 'POST', endpoint: '/image/flux-2-max', priceUsd: 0.08, rails: ['x402'], tags: ['image', 'generation'] },
      { id: 'xona-gpt-image-2', name: 'GPT Image 2', category: 'creative', method: 'POST', endpoint: '/image/gpt-image-2', priceUsd: 0.12, rails: ['x402'], tags: ['image', 'generation'] },
      { id: 'xona-creative-director', name: 'Creative Director', category: 'creative', method: 'POST', endpoint: '/image/creative-director', priceUsd: 0.03, rails: ['x402'], tags: ['prompting', 'research'] },
      { id: 'xona-token-risk-summary', name: 'Token Risk Summary', category: 'token-intelligence', method: 'POST', endpoint: '/tokens-api/risk-summary', priceUsd: 0.0001, rails: ['x402'], tags: ['risk', 'tokens'] },
      { id: 'xona-token-search', name: 'Token Search', category: 'token-intelligence', method: 'POST', endpoint: '/tokens-api/search', priceUsd: 0.0001, rails: ['x402'], tags: ['search', 'tokens'] },
      { id: 'xona-market-snapshots', name: 'Bulk Market Snapshots', category: 'token-intelligence', method: 'POST', endpoint: '/tokens-api/market-snapshots', priceUsd: 0.0001, rails: ['x402'], tags: ['markets', 'tokens'] },
      { id: 'xona-pumpfun-movers', name: 'PumpFun Movers', category: 'solana-markets', method: 'GET', endpoint: '/token/pumpfun-movers', priceUsd: 0.1, rails: ['x402'], tags: ['pumpfun', 'movers'] },
      { id: 'xona-pumpfun-trending', name: 'PumpFun Trending', category: 'solana-markets', method: 'GET', endpoint: '/token/pumpfun-trending', priceUsd: 0.1, rails: ['x402'], tags: ['pumpfun', 'trending'] },
      { id: 'xona-solana-discovery', name: 'Solana Discovery', category: 'solana-markets', method: 'POST', endpoint: '/token/solana-discovery', priceUsd: 0.0001, rails: ['x402'], tags: ['solana', 'discovery'] },
      { id: 'xona-solana-market', name: 'Solana Market', category: 'solana-markets', method: 'POST', endpoint: '/token/solana-market', priceUsd: 0.0001, rails: ['x402'], tags: ['solana', 'market'] },
      { id: 'xona-token-news', name: 'Token News', category: 'publishing', method: 'POST', endpoint: '/token/news', priceUsd: 0.5, rails: ['x402'], tags: ['news', 'social'] },
      { id: 'xona-token-signal', name: 'Token Signal', category: 'signals', method: 'POST', endpoint: '/token/signal', priceUsd: 0.02, rails: ['x402'], tags: ['signals', 'sentiment'] },
      { id: 'xona-token-starter-kit', name: 'Token Starter Kit', category: 'brand-kit', method: 'POST', endpoint: '/token/starter-kit', priceUsd: 0.2, rails: ['x402'], tags: ['brand', 'launch'] },
    ],
    presets: [
      {
        id: 'xona-research-agent',
        name: 'Research Agent',
        dailyCapUsd: 5,
        perCallCapUsd: 0.1,
        resourceIds: ['xona-token-risk-summary', 'xona-token-search', 'xona-market-snapshots', 'xona-solana-discovery', 'xona-solana-market', 'xona-token-signal'],
      },
      {
        id: 'xona-market-agent',
        name: 'Market Agent',
        dailyCapUsd: 12,
        perCallCapUsd: 0.2,
        resourceIds: ['xona-pumpfun-movers', 'xona-pumpfun-trending', 'xona-solana-discovery', 'xona-solana-market', 'xona-token-signal'],
      },
      {
        id: 'xona-creative-agent',
        name: 'Creative Agent',
        dailyCapUsd: 20,
        perCallCapUsd: 0.5,
        resourceIds: ['xona-flux-2-pro', 'xona-flux-2-max', 'xona-gpt-image-2', 'xona-creative-director', 'xona-token-news', 'xona-token-starter-kit'],
      },
    ],
  },
];

function safePack(pack) {
  return {
    ...pack,
    resources: pack.resources.map(resource => ({ ...resource })),
    presets: pack.presets.map(preset => ({ ...preset, resourceIds: [...preset.resourceIds] })),
    policyDefaults: { ...pack.policyDefaults },
  };
}

function routeForResource(resource) {
  return `/xona${resource.endpoint}`;
}

export function listResourcePacks() {
  return RESOURCE_PACKS.map(pack => ({
    id: pack.id,
    slug: pack.slug,
    name: pack.name,
    provider: pack.provider,
    website: pack.website,
    summary: pack.summary,
    rails: pack.rails,
    settlementAsset: pack.settlementAsset,
    resourceCount: pack.resources.length,
    presets: pack.presets.map(preset => ({ id: preset.id, name: preset.name, dailyCapUsd: preset.dailyCapUsd, perCallCapUsd: preset.perCallCapUsd })),
  }));
}

export function getResourcePack(packIdOrSlug) {
  const key = String(packIdOrSlug || '').toLowerCase();
  const pack = RESOURCE_PACKS.find(item => item.id === key || item.slug === key);
  if (!pack) return null;
  return safePack(pack);
}

export function buildResourcePackPolicy(packIdOrSlug, input = {}) {
  const pack = getResourcePack(packIdOrSlug);
  if (!pack) return null;

  const preset = input.presetId
    ? pack.presets.find(item => item.id === input.presetId)
    : null;
  const requestedIds = Array.isArray(input.resourceIds) && input.resourceIds.length
    ? input.resourceIds
    : preset?.resourceIds || pack.resources.map(resource => resource.id);
  const selected = pack.resources.filter(resource => requestedIds.includes(resource.id));
  const selectedResources = selected.length ? selected : pack.resources;
  const maxPrice = Math.max(...selectedResources.map(resource => Number(resource.priceUsd || 0)), 0);

  return {
    pack: {
      id: pack.id,
      slug: pack.slug,
      name: pack.name,
      provider: pack.provider,
      website: pack.website,
    },
    preset: preset ? { id: preset.id, name: preset.name } : null,
    selectedResources,
    budget: {
      name: input.name || `${pack.provider} ${preset?.name || 'Resource'} Policy`,
      agentId: input.agentId || 'xona-agent',
      dailyCapUsd: Number(input.dailyCapUsd ?? preset?.dailyCapUsd ?? pack.policyDefaults.dailyCapUsd),
      perCallCapUsd: Number(input.perCallCapUsd ?? preset?.perCallCapUsd ?? Math.max(maxPrice, pack.policyDefaults.perCallCapUsd)),
      approvalThresholdUsd: Number(input.approvalThresholdUsd ?? pack.policyDefaults.approvalThresholdUsd),
      allowedRoutes: selectedResources.map(routeForResource),
      allowedRails: input.allowedRails || pack.policyDefaults.allowedRails,
      mode: input.mode || pack.policyDefaults.mode,
      piiGuard: input.piiGuard ?? pack.policyDefaults.piiGuard,
      requireReceipt: input.requireReceipt ?? pack.policyDefaults.requireReceipt,
      deniedProviderIds: input.deniedProviderIds || [],
      onExhausted: input.onExhausted || 'stop_workflow',
    },
  };
}

export async function createResourcePackBudget(packIdOrSlug, input = {}, principal = {}) {
  const template = buildResourcePackPolicy(packIdOrSlug, input);
  if (!template) return null;
  const budget = await createBudget(template.budget, principal.apiKey, principal.wallet);
  return { ...template, budget };
}
