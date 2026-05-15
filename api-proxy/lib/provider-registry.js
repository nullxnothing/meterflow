import crypto from 'crypto';
import { getRedis } from './redis.js';
import { isPostgresEnabled, query as pgQuery } from './postgres.js';
import { logger } from './logger.js';

const IS_PROD = process.env.NODE_ENV === 'production';
const REGISTRY_PREFIX = 'meterflow:provider-registry:';
const REGISTRY_NAMESPACE = 'provider_registry';
const fallbackProviders = new Map();

const STATUS_VALUES = new Set(['forming', 'test', 'live', 'paused', 'archived']);
const VERIFICATION_VALUES = new Set(['unverified', 'reviewing', 'verified', 'prime']);
const BOND_STATE_VALUES = new Set(['planned', 'pending', 'locked', 'cooldown', 'released', 'treasury_aligned']);
const RAIL_VALUES = new Set(['x402', 'mpp', 'mcp', 'solana-pay', 'api-key']);

const BASE_PROVIDERS = [
  {
    id: 'prv_meterflow_token_risk',
    slug: 'meterflow-token-risk',
    name: 'Meterflow Token Risk MCP',
    category: 'risk-intelligence',
    summary: 'A Meterflow-owned MCP capability that demonstrates priced token risk checks, paid route receipts, and budget-aware agent calls.',
    endpoint: '/mcp/token-risk',
    website: 'https://meterflow.fun/docs#registry',
    protocolRails: ['x402', 'mpp', 'mcp'],
    paymentAsset: 'USDC',
    priceUsd: 0.006,
    status: 'live',
    verification: 'verified',
    ownerWallet: 'meterflow',
    bond: { asset: 'MFLOW', required: 250000, committed: 250000, state: 'treasury_aligned', unlockCooldownDays: 14 },
    metrics: { successfulCalls: 412, verifiedUsd: 2.47, uptimePct: 99.4, p95LatencyMs: 228, failureRatePct: 0.8, receipts30d: 412 },
    policy: { supportsBudgets: true, supportsRefunds: false, piiGuard: true, agentAllowlisted: true },
    tags: ['mcp', 'risk', 'reference'],
    source: 'meterflow_seed',
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
  },
  {
    id: 'prv_wallet_intel_cohort',
    slug: 'wallet-intel-cohort',
    name: 'Wallet Intelligence Cohort',
    category: 'wallet-intelligence',
    summary: 'Launch-partner slot for wallet tracing, holder analysis, and funding-source APIs that agents can buy per lookup.',
    endpoint: '/gateway/{provider}/wallet/*',
    website: 'https://meterflow.fun/apply',
    protocolRails: ['x402', 'mpp'],
    paymentAsset: 'USDC',
    priceUsd: 0.012,
    status: 'forming',
    verification: 'reviewing',
    ownerWallet: '',
    bond: { asset: 'MFLOW', required: 500000, committed: 0, state: 'planned', unlockCooldownDays: 14 },
    metrics: { successfulCalls: 0, verifiedUsd: 0, uptimePct: null, p95LatencyMs: null, failureRatePct: null, receipts30d: 0 },
    policy: { supportsBudgets: true, supportsRefunds: true, piiGuard: true, agentAllowlisted: true },
    tags: ['wallets', 'forensics', 'launch-cohort'],
    source: 'meterflow_seed',
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
  },
  {
    id: 'prv_market_data_cohort',
    slug: 'market-data-cohort',
    name: 'Solana Market Data Cohort',
    category: 'market-data',
    summary: 'Launch-partner slot for price, liquidity, route, and pool data providers that want metered API revenue without subscriptions.',
    endpoint: '/gateway/{provider}/markets/*',
    website: 'https://meterflow.fun/apply',
    protocolRails: ['x402', 'mpp'],
    paymentAsset: 'USDC',
    priceUsd: 0.009,
    status: 'forming',
    verification: 'reviewing',
    ownerWallet: '',
    bond: { asset: 'MFLOW', required: 350000, committed: 0, state: 'planned', unlockCooldownDays: 14 },
    metrics: { successfulCalls: 0, verifiedUsd: 0, uptimePct: null, p95LatencyMs: null, failureRatePct: null, receipts30d: 0 },
    policy: { supportsBudgets: true, supportsRefunds: false, piiGuard: false, agentAllowlisted: true },
    tags: ['market-data', 'liquidity', 'launch-cohort'],
    source: 'meterflow_seed',
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
  },
  {
    id: 'prv_xona_agent_resources',
    slug: 'xona-agent-resources',
    name: 'Xona Agent Resources',
    category: 'agent-resources',
    summary: 'Policy-ready x402/MPP resource pack for Xona endpoints including creative generation, token intelligence, Solana discovery, PumpFun movers, token news, and token signals.',
    endpoint: '/xona/*',
    website: 'https://xona-agent.com/resources',
    protocolRails: ['x402', 'mpp'],
    paymentAsset: 'USDC',
    priceUsd: 0.0001,
    status: 'live',
    verification: 'reviewing',
    ownerWallet: '',
    bond: { asset: 'MFLOW', required: 500000, committed: 0, state: 'planned', unlockCooldownDays: 14 },
    metrics: { successfulCalls: 0, verifiedUsd: 0, uptimePct: null, p95LatencyMs: null, failureRatePct: null, receipts30d: 0 },
    policy: { supportsBudgets: true, supportsRefunds: true, piiGuard: true, agentAllowlisted: true },
    tags: ['xona', 'x402', 'mpp', 'resource-pack', 'creative', 'token-data'],
    source: 'meterflow_seed',
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
  },
];

function nowIso() {
  return new Date().toISOString();
}

function id() {
  return `prv_${crypto.randomBytes(6).toString('hex')}`;
}

function text(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function slugify(value) {
  const slug = text(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || `provider-${crypto.randomBytes(3).toString('hex')}`;
}

function enumValue(value, allowed, fallback) {
  const normalized = text(value, 60).toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function textList(value, allowed = null) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',');
  return [...new Set(raw.map(item => text(item, 80).toLowerCase()).filter(Boolean))]
    .filter(item => !allowed || allowed.has(item));
}

function normalizeStoredData(data) {
  return typeof data === 'string' ? JSON.parse(data) : data;
}

function storageColumns(item = {}) {
  return {
    apiKey: null,
    ownerWallet: item.ownerWallet || null,
    route: item.endpoint || null,
    status: item.status || null,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || item.createdAt || null,
  };
}

function baseProviders() {
  return BASE_PROVIDERS.map(provider => normalizeProvider(provider));
}

function mergeProviders(rows = []) {
  const merged = new Map();
  for (const provider of baseProviders()) merged.set(provider.id, provider);
  for (const provider of fallbackProviders.values()) merged.set(provider.id, provider);
  for (const provider of rows) merged.set(provider.id, normalizeProvider(provider));
  return [...merged.values()];
}

async function scanRegistryProviders() {
  if (isPostgresEnabled()) {
    try {
      const rows = await pgQuery(
        `select data
           from meterflow_control_records
          where namespace = $1
          order by coalesce(updated_at, created_at) desc nulls last`,
        [REGISTRY_NAMESPACE],
      );
      return mergeProviders(rows.rows.map(row => normalizeStoredData(row.data)));
    } catch (err) {
      logger.error('Provider registry Postgres scan failed', { err: err.message });
      if (IS_PROD) throw new Error('Provider registry store unavailable');
      return mergeProviders();
    }
  }

  const r = getRedis();
  if (!r) return mergeProviders();

  try {
    const keys = [];
    let cursor = '0';
    do {
      const [next, batch] = await r.scan(cursor, 'MATCH', `${REGISTRY_PREFIX}*`, 'COUNT', 200);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');

    if (keys.length === 0) return mergeProviders();

    const pipeline = r.pipeline();
    for (const key of keys) pipeline.get(key);
    const rows = await pipeline.exec();
    const redisRows = rows.map(row => row?.[1]).filter(Boolean).map(row => JSON.parse(row));
    return mergeProviders(redisRows);
  } catch (err) {
    logger.error('Provider registry Redis scan failed', { err: err.message });
    if (IS_PROD) throw new Error('Provider registry store unavailable');
    return mergeProviders();
  }
}

async function setRegistryProvider(item) {
  const provider = normalizeProvider(item);
  fallbackProviders.set(provider.id, provider);

  if (isPostgresEnabled()) {
    const cols = storageColumns(provider);
    try {
      await pgQuery(
        `insert into meterflow_control_records
          (namespace, id, api_key, owner_wallet, route, status, created_at, updated_at, data)
         values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9::jsonb)
         on conflict (namespace, id) do update set
           owner_wallet = excluded.owner_wallet,
           route = excluded.route,
           status = excluded.status,
           created_at = coalesce(meterflow_control_records.created_at, excluded.created_at),
           updated_at = excluded.updated_at,
           data = excluded.data`,
        [
          REGISTRY_NAMESPACE,
          provider.id,
          cols.apiKey,
          cols.ownerWallet,
          cols.route,
          cols.status,
          cols.createdAt,
          cols.updatedAt,
          JSON.stringify(provider),
        ],
      );
      return provider;
    } catch (err) {
      logger.error('Provider registry Postgres write failed', { id: provider.id, err: err.message });
      if (IS_PROD) throw new Error('Provider registry store unavailable');
      return provider;
    }
  }

  const r = getRedis();
  if (!r) return provider;

  try {
    await r.set(`${REGISTRY_PREFIX}${provider.id}`, JSON.stringify(provider));
    return provider;
  } catch (err) {
    logger.error('Provider registry Redis write failed', { id: provider.id, err: err.message });
    if (IS_PROD) throw new Error('Provider registry store unavailable');
    return provider;
  }
}

export function normalizeProvider(input = {}) {
  const ts = input.createdAt || nowIso();
  const name = text(input.name, 160);
  const bond = input.bond || {};
  const metrics = input.metrics || {};
  const policy = input.policy || {};
  const provider = {
    id: text(input.id, 80) || id(),
    slug: slugify(input.slug || name),
    name,
    category: text(input.category, 80).toLowerCase() || 'api',
    summary: text(input.summary, 600),
    endpoint: text(input.endpoint, 260),
    website: text(input.website, 260),
    protocolRails: textList(input.protocolRails || input.rails, RAIL_VALUES),
    paymentAsset: text(input.paymentAsset || 'USDC', 20).toUpperCase(),
    priceUsd: number(input.priceUsd, 0),
    status: enumValue(input.status, STATUS_VALUES, 'forming'),
    verification: enumValue(input.verification, VERIFICATION_VALUES, 'unverified'),
    ownerWallet: text(input.ownerWallet, 120),
    bond: {
      asset: text(bond.asset || 'MFLOW', 20).toUpperCase(),
      required: number(bond.required, 0),
      committed: number(bond.committed, 0),
      state: enumValue(bond.state, BOND_STATE_VALUES, 'planned'),
      txSignature: text(bond.txSignature, 120),
      unlockCooldownDays: number(bond.unlockCooldownDays, 14),
    },
    metrics: {
      successfulCalls: number(metrics.successfulCalls, 0),
      verifiedUsd: number(metrics.verifiedUsd, 0),
      uptimePct: nullableNumber(metrics.uptimePct),
      p95LatencyMs: nullableNumber(metrics.p95LatencyMs),
      failureRatePct: nullableNumber(metrics.failureRatePct),
      receipts30d: number(metrics.receipts30d, 0),
    },
    policy: {
      supportsBudgets: Boolean(policy.supportsBudgets),
      supportsRefunds: Boolean(policy.supportsRefunds),
      piiGuard: Boolean(policy.piiGuard),
      agentAllowlisted: Boolean(policy.agentAllowlisted),
    },
    tags: textList(input.tags),
    source: text(input.source || 'admin', 80),
    adminNotes: text(input.adminNotes, 2500),
    createdAt: ts,
    updatedAt: input.updatedAt || ts,
  };

  provider.trustScore = scoreProvider(provider);
  provider.trustTier = trustTier(provider.trustScore);
  return provider;
}

export function validateProvider(input = {}) {
  const fields = {};
  if (!text(input.name)) fields.name = 'Provider name is required.';
  if (!text(input.category)) fields.category = 'Category is required.';
  if (!text(input.summary)) fields.summary = 'Summary is required.';
  if (!text(input.endpoint)) fields.endpoint = 'Endpoint or capability route is required.';
  if (textList(input.protocolRails || input.rails, RAIL_VALUES).length === 0) fields.protocolRails = 'Add at least one supported payment/tool rail.';
  return { ok: Object.keys(fields).length === 0, fields };
}

export function scoreProvider(provider = {}) {
  const verificationScore = { prime: 25, verified: 21, reviewing: 10, unverified: 0 }[provider.verification] || 0;
  const required = number(provider.bond?.required, 0);
  const committed = number(provider.bond?.committed, 0);
  const bondRatio = required > 0 ? Math.min(committed / required, 1) : 0;
  const bondStateBonus = ['locked', 'treasury_aligned'].includes(provider.bond?.state) ? 6 : provider.bond?.state === 'pending' ? 3 : 0;
  const bondScore = Math.min(14 * bondRatio + bondStateBonus, 20);
  const callsScore = Math.min(Math.log10(number(provider.metrics?.successfulCalls, 0) + 1) * 5, 15);
  const revenueScore = Math.min(Math.log10(number(provider.metrics?.verifiedUsd, 0) + 1) * 2.5, 5);
  const uptime = provider.metrics?.uptimePct === null || provider.metrics?.uptimePct === undefined ? 0 : Math.max(Math.min(Number(provider.metrics.uptimePct), 100) - 94, 0) / 6 * 12;
  const failureRate = provider.metrics?.failureRatePct === null || provider.metrics?.failureRatePct === undefined ? 0 : Math.max(8 - Math.min(Number(provider.metrics.failureRatePct), 8), 0);
  const latency = provider.metrics?.p95LatencyMs === null || provider.metrics?.p95LatencyMs === undefined ? 0 : Math.max(5 - Math.max(Number(provider.metrics.p95LatencyMs) - 250, 0) / 250, 0);
  const policyScore = [
    provider.policy?.supportsBudgets,
    provider.policy?.agentAllowlisted,
    provider.policy?.supportsRefunds,
    provider.policy?.piiGuard,
  ].filter(Boolean).length * 3.75;

  return Math.round(Math.min(100, verificationScore + bondScore + callsScore + revenueScore + uptime + failureRate + latency + policyScore));
}

export function trustTier(score = 0) {
  if (score >= 85) return 'prime';
  if (score >= 70) return 'verified';
  if (score >= 55) return 'candidate';
  return 'emerging';
}

export function publicProvider(provider = {}) {
  const { adminNotes: _adminNotes, ...safe } = normalizeProvider(provider);
  return safe;
}

export async function createRegistryProvider(input = {}, meta = {}) {
  const validation = validateProvider(input);
  if (!validation.ok) {
    const err = new Error('Invalid registry provider');
    err.fields = validation.fields;
    throw err;
  }

  const ts = nowIso();
  return setRegistryProvider({
    ...input,
    id: text(input.id, 80) || id(),
    source: meta.source || input.source || 'admin',
    createdAt: ts,
    updatedAt: ts,
  });
}

export async function listRegistryProviders(filters = {}) {
  const limit = Math.min(number(filters.limit, 50) || 50, 100);
  const category = text(filters.category, 80).toLowerCase();
  const rail = text(filters.rail, 40).toLowerCase();
  const status = text(filters.status, 40).toLowerCase();
  const verification = text(filters.verification, 40).toLowerCase();
  const minScore = number(filters.minScore, 0);
  const providers = await scanRegistryProviders();

  return providers
    .map(publicProvider)
    .filter(provider => !category || provider.category === category)
    .filter(provider => !rail || provider.protocolRails.includes(rail))
    .filter(provider => !status || provider.status === status)
    .filter(provider => !verification || provider.verification === verification)
    .filter(provider => provider.trustScore >= minScore)
    .sort((a, b) => b.trustScore - a.trustScore || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, limit);
}

export async function getRegistryProvider(providerIdOrSlug) {
  const key = text(providerIdOrSlug, 120).toLowerCase();
  const providers = await scanRegistryProviders();
  const provider = providers.find(item => item.id.toLowerCase() === key || item.slug === key);
  return provider ? publicProvider(provider) : null;
}

export async function updateRegistryProvider(providerIdOrSlug, patch = {}) {
  const current = await getRegistryProvider(providerIdOrSlug);
  if (!current) return null;

  const next = normalizeProvider({
    ...current,
    ...patch,
    bond: { ...current.bond, ...(patch.bond || {}) },
    metrics: { ...current.metrics, ...(patch.metrics || {}) },
    policy: { ...current.policy, ...(patch.policy || {}) },
    updatedAt: nowIso(),
  });
  return setRegistryProvider(next);
}

export async function getRegistrySummary() {
  const providers = await listRegistryProviders({ limit: 100 });
  const categories = {};
  const rails = {};
  const bondStates = {};
  let committedMflow = 0;
  let requiredMflow = 0;

  for (const provider of providers) {
    categories[provider.category] = (categories[provider.category] || 0) + 1;
    for (const rail of provider.protocolRails) rails[rail] = (rails[rail] || 0) + 1;
    bondStates[provider.bond.state] = (bondStates[provider.bond.state] || 0) + 1;
    if (provider.bond.asset === 'MFLOW') {
      committedMflow += number(provider.bond.committed, 0);
      requiredMflow += number(provider.bond.required, 0);
    }
  }

  return {
    providers: providers.length,
    liveProviders: providers.filter(provider => provider.status === 'live').length,
    verifiedProviders: providers.filter(provider => ['verified', 'prime'].includes(provider.verification)).length,
    averageTrustScore: providers.length ? Math.round(providers.reduce((sum, provider) => sum + provider.trustScore, 0) / providers.length) : 0,
    committedMflow,
    requiredMflow,
    categories,
    rails,
    bondStates,
    model: {
      paymentAsset: 'USDC',
      utilityAsset: 'MFLOW',
      thesis: 'USDC settles paid requests; MFLOW coordinates provider trust, registry visibility, policy limits, analytics, and future bonding.',
    },
  };
}
