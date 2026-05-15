import crypto from 'crypto';
import net from 'net';
import { CONFIG } from '../config.js';
import { getRedis } from './redis.js';
import { isPostgresEnabled, query as pgQuery } from './postgres.js';
import { logger } from './logger.js';

const IS_PROD = process.env.NODE_ENV === 'production';
const METER_PREFIX = 'meterflow:meter:';
const RECEIPT_PREFIX = 'meterflow:receipt:';
const BUDGET_PREFIX = 'meterflow:budget:';
const MCP_TOOL_PREFIX = 'meterflow:mcp-tool:';
const IDEMPOTENCY_PREFIX = 'meterflow:idempotency:';
const WEBHOOK_PREFIX = 'meterflow:webhook:';

const STORE_NAMESPACES = new Map([
  [METER_PREFIX, 'meter'],
  [RECEIPT_PREFIX, 'receipt'],
  [BUDGET_PREFIX, 'budget'],
  [MCP_TOOL_PREFIX, 'mcp_tool'],
  [WEBHOOK_PREFIX, 'webhook'],
]);

const fallbackMeters = new Map();
const fallbackReceipts = new Map();
const fallbackBudgets = new Map();
const fallbackMcpTools = new Map();
const fallbackIdempotency = new Map();
const fallbackWebhooks = new Map();

const WEBHOOK_EVENTS = new Set([
  'receipt.created',
  'receipt.verified',
  'payment.verified',
  'payment.failed',
  'budget.exhausted',
  'webhook.test',
]);

const PAYMENT_RAILS = new Set(['x402', 'mpp', 'meterflow', 'api-key', 'solana-pay']);
const BUDGET_MODES = new Set(['enforce', 'monitor']);

export const DEFAULT_METERS = [
  { id: 'mtr_mcp_token_risk', route: '/mcp/token-risk', method: 'POST', unit: 'MCP tool call', priceUsd: 0.006, asset: 'USDC', status: 'live', mode: 'live', ownerWallet: 'meterflow', source: 'default' },
  { id: 'mtr_mcp_token_risk_get', route: '/mcp/token-risk', method: 'GET', unit: 'MCP tool metadata', priceUsd: 0.006, asset: 'USDC', status: 'live', mode: 'live', ownerWallet: 'meterflow', source: 'default' },
];

function nowIso() {
  return new Date().toISOString();
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function maskKey(apiKey = '') {
  return apiKey ? `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}` : null;
}

function header(req, name) {
  return req?.headers?.[name.toLowerCase()] || req?.headers?.[name] || null;
}

function requestHash(req) {
  if (!req) return null;
  const body = req.body ? JSON.stringify(req.body).slice(0, 20_000) : '';
  return crypto
    .createHash('sha256')
    .update(`${req.method || ''}:${req.originalUrl || req.path || ''}:${body}`)
    .digest('hex');
}

function webhookSecret() {
  return `mfwhsec_${crypto.randomBytes(24).toString('hex')}`;
}

function maskSecret(secret = '') {
  return secret ? `${secret.slice(0, 10)}...${secret.slice(-4)}` : null;
}

function isFailureReceiptStatus(status = '') {
  const normalized = String(status || '').toLowerCase();
  return normalized.includes('failed')
    || normalized.includes('denied')
    || normalized.includes('exhausted')
    || normalized.includes('exceeded')
    || normalized.includes('error');
}

function sanitizeWebhook(webhook, exposeSecret = false) {
  if (!webhook) return null;
  const { secret, ...safe } = webhook;
  return {
    ...safe,
    ...(exposeSecret ? { secret } : { secretMasked: maskSecret(secret) }),
  };
}

function normalizeWebhookEvents(events) {
  const input = Array.isArray(events) && events.length ? events : ['receipt.created'];
  return [...new Set(input.filter(event => WEBHOOK_EVENTS.has(event)))];
}

function normalizeWebhookUrl(rawUrl) {
  const url = new URL(String(rawUrl || ''));
  const allowedProtocol = IS_PROD ? url.protocol === 'https:' : ['http:', 'https:'].includes(url.protocol);
  if (!allowedProtocol) {
    throw new Error(IS_PROD ? 'Webhook URL must use HTTPS.' : 'Webhook URL must use HTTP or HTTPS.');
  }
  return url.toString();
}

function hasProtocolFeeRelief(access) {
  if (access && typeof access === 'object') {
    const minSignal = CONFIG.TIERS.signal?.min || 0;
    return Number(access.balance || 0) >= minSignal
      || (!access.guest && access.wallet && CONFIG.WHITELISTED_WALLETS.has(access.wallet));
  }
  return !!access && String(access).toLowerCase() !== 'trial';
}

function getProtocolFeeBps(access) {
  return hasProtocolFeeRelief(access)
    ? Number(CONFIG.HOLDER_PROTOCOL_FEE_BPS || 0)
    : Number(CONFIG.PROTOCOL_FEE_BPS || 0);
}

export function applyProtocolFee(amountUsd, access) {
  const baseAmountUsd = Number(amountUsd || 0);
  const protocolFeeBps = getProtocolFeeBps(access);
  const protocolFeeUsd = +(baseAmountUsd * protocolFeeBps / 10_000).toFixed(6);
  return {
    baseAmountUsd,
    protocolFeeBps,
    protocolFeeUsd,
    totalAmountUsd: +(baseAmountUsd + protocolFeeUsd).toFixed(6),
  };
}

function normalizePath(path = '') {
  const clean = path.split('?')[0].replace(/^\/proxy/, '');
  return clean.replace(/\/$/, '') || '/';
}

function normalizePaymentRail(value, fallback = 'x402') {
  const rail = String(value || fallback).trim().toLowerCase();
  return PAYMENT_RAILS.has(rail) ? rail : fallback;
}

function normalizePaymentRailList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || '').trim().toLowerCase()).filter(rail => PAYMENT_RAILS.has(rail)))];
}

function normalizeStringList(value, max = 50) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))].slice(0, max);
}

function normalizeRouteList(value) {
  return normalizeStringList(value).map(route => normalizePath(route));
}

function routeMatchesPolicy(route, patterns = []) {
  const normalized = normalizePath(route);
  return patterns.some(pattern => {
    const candidate = normalizePath(pattern);
    if (candidate.endsWith('*')) return normalized.startsWith(candidate.slice(0, -1));
    return normalized === candidate;
  });
}

function hashMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(metadata).slice(0, 20_000))
    .digest('hex');
}

function assertZauthObservedMeterRoute(route) {
  const normalized = normalizePath(route);
  if (normalized.startsWith('/mcp/') || normalized.startsWith('/gateway/')) return;
  throw new Error('route must start with /mcp/ or /gateway/ so paid x402 traffic is monitored by Zauth.');
}

function normalizeProviderName(value) {
  const name = String(value || '').trim();
  return name ? name.slice(0, 80) : null;
}

function isPrivateIPv4(hostname) {
  if (net.isIP(hostname) !== 4) return false;
  const parts = hostname.split('.').map(Number);
  return (
    parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] === 0
  );
}

function isUnsafeTargetHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return (
    !host
    || host === 'localhost'
    || host.endsWith('.localhost')
    || host === 'metadata.google.internal'
    || host.endsWith('.internal')
    || host.endsWith('.local')
    || net.isIP(host) === 6
    || isPrivateIPv4(host)
  );
}

export function normalizeTargetUrl(rawUrl) {
  const url = new URL(String(rawUrl || '').trim());
  if (IS_PROD && url.protocol !== 'https:') {
    throw new Error('targetUrl must use HTTPS in production.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('targetUrl must use HTTP or HTTPS.');
  }
  if (isUnsafeTargetHost(url.hostname)) {
    throw new Error('targetUrl host is not allowed.');
  }
  url.username = '';
  url.password = '';
  url.hash = '';
  return {
    targetUrl: url.toString().replace(/\/$/, ''),
    targetHost: url.host,
  };
}

function normalizeUpstreamAuth(input) {
  if (!input) return null;
  if (typeof input === 'string') {
    return { type: 'bearer', value: input, configured: true };
  }
  if (typeof input !== 'object') return null;
  const type = String(input.type || 'bearer').toLowerCase();
  if (!['bearer', 'header'].includes(type)) return null;
  const headerName = String(input.headerName || input.name || (type === 'bearer' ? 'Authorization' : '')).trim();
  const value = String(input.value || input.token || '').trim();
  if (!value) return null;
  return {
    type,
    headerName: headerName || 'Authorization',
    value,
    configured: true,
  };
}

function normalizeBudgetPolicy(input = {}) {
  return {
    agentId: String(input.agentId || 'default-agent').trim().slice(0, 96) || 'default-agent',
    dailyCapUsd: Number(input.dailyCapUsd || 12),
    perCallCapUsd: Number(input.perCallCapUsd || 0.02),
    allowedMeterIds: normalizeStringList(input.allowedMeterIds),
    allowedRoutes: normalizeRouteList(input.allowedRoutes),
    allowedRails: normalizePaymentRailList(input.allowedRails),
    deniedProviderIds: normalizeStringList(input.deniedProviderIds),
    mode: BUDGET_MODES.has(String(input.mode || '').toLowerCase()) ? String(input.mode).toLowerCase() : 'enforce',
    piiGuard: input.piiGuard !== false,
    requireReceipt: input.requireReceipt !== false,
    approvalThresholdUsd: Number(input.approvalThresholdUsd || 0),
    onExhausted: input.onExhausted || 'stop_workflow',
  };
}

export function recommendPaymentPath(input = {}) {
  const intent = String(input.intent || input.paymentIntent || 'request').toLowerCase();
  const expectedCalls = Number(input.expectedCalls || 1);
  const requestedRail = input.paymentProtocol ? normalizePaymentRail(input.paymentProtocol) : null;
  const rail = requestedRail || (intent === 'session' || intent === 'stream' || expectedCalls > 1 ? 'mpp' : 'x402');
  const requiresCompliance = Boolean(input.requiresCompliance || input.enterprise || input.kytRequired);
  const gasless = Boolean(input.gasless || input.sponsoredFees);
  const facilitator = rail === 'mpp'
    ? 'mpp-session'
    : gasless
      ? 'kora'
      : requiresCompliance
        ? 'cdp-x402'
        : 'payai-solana';

  return {
    rail,
    facilitator,
    settlementAsset: 'USDC',
    settlementNetwork: 'solana-mainnet-beta',
    reason: rail === 'mpp'
      ? 'Session or multi-call intent benefits from MPP lifecycle semantics.'
      : 'Exact one-shot API access maps cleanly to x402 on Solana.',
    controls: {
      policyCheck: true,
      receiptRequired: input.requireReceipt !== false,
      piiGuard: input.piiGuard !== false,
      auditTrail: true,
    },
  };
}

function sanitizeMeter(meter) {
  if (!meter) return null;
  const { upstreamAuth, ...safe } = meter;
  return {
    ...safe,
    upstreamAuthConfigured: !!upstreamAuth?.value,
  };
}

function namespaceForPrefix(prefix) {
  const namespace = STORE_NAMESPACES.get(prefix);
  if (!namespace) throw new Error(`Unknown control-plane namespace for ${prefix}`);
  return namespace;
}

function normalizeStoredData(data) {
  return typeof data === 'string' ? JSON.parse(data) : data;
}

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function storageColumns(item = {}) {
  return {
    apiKey: item.apiKey || null,
    ownerWallet: item.ownerWallet || item.operatorWallet || item.wallet || null,
    route: item.route || null,
    status: item.status || null,
    createdAt: dateOrNull(item.createdAt),
    updatedAt: dateOrNull(item.updatedAt || item.createdAt),
  };
}

async function scanJson(prefix, fallbackMap, options = {}) {
  if (isPostgresEnabled()) {
    const namespace = namespaceForPrefix(prefix);
    try {
      const rows = await pgQuery(
        `select data
           from meterflow_control_records
          where namespace = $1
          order by coalesce(updated_at, created_at) desc nulls last`,
        [namespace],
      );
      const postgresRows = rows.rows.map(row => normalizeStoredData(row.data));
      return [...postgresRows, ...fallbackMap.values()].filter((item, index, arr) => (
        arr.findIndex(other => other.id === item.id) === index
      ));
    } catch (err) {
      if (!options.quiet) logger.error('Control plane Postgres scan failed', { namespace, err: err.message });
      if (IS_PROD && !options.allowFallback) throw new Error('Control plane store unavailable');
      return [...fallbackMap.values()];
    }
  }

  const r = getRedis();
  if (!r) return [...fallbackMap.values()];

  try {
    const keys = [];
    let cursor = '0';
    do {
      const [next, batch] = await r.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');

    if (keys.length === 0) return [...fallbackMap.values()];

    const pipeline = r.pipeline();
    for (const key of keys) pipeline.get(key);
    const rows = await pipeline.exec();
    const redisRows = rows
      .map(row => row?.[1])
      .filter(Boolean)
      .map(row => JSON.parse(row));
    return [...redisRows, ...fallbackMap.values()].filter((item, index, arr) => (
      arr.findIndex(other => other.id === item.id) === index
    ));
  } catch (err) {
    if (!options.quiet) logger.error('Control plane scan failed', { prefix, err: err.message });
    if (IS_PROD && !options.allowFallback) throw new Error('Control plane store unavailable');
    return [...fallbackMap.values()];
  }
}

async function setJson(prefix, fallbackMap, item) {
  fallbackMap.set(item.id, item);
  if (isPostgresEnabled()) {
    const namespace = namespaceForPrefix(prefix);
    const cols = storageColumns(item);
    try {
      await pgQuery(
        `insert into meterflow_control_records
          (namespace, id, api_key, owner_wallet, route, status, created_at, updated_at, data)
         values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9::jsonb)
         on conflict (namespace, id) do update set
           api_key = excluded.api_key,
           owner_wallet = excluded.owner_wallet,
           route = excluded.route,
           status = excluded.status,
           created_at = coalesce(meterflow_control_records.created_at, excluded.created_at),
           updated_at = excluded.updated_at,
           data = excluded.data`,
        [
          namespace,
          item.id,
          cols.apiKey,
          cols.ownerWallet,
          cols.route,
          cols.status,
          cols.createdAt,
          cols.updatedAt,
          JSON.stringify(item),
        ],
      );
      return item;
    } catch (err) {
      logger.error('Control plane Postgres set failed', { namespace, id: item.id, err: err.message });
      if (IS_PROD) throw new Error('Control plane store unavailable');
      return item;
    }
  }

  const r = getRedis();
  if (!r) return item;

  try {
    await r.set(`${prefix}${item.id}`, JSON.stringify(item));
    return item;
  } catch (err) {
    logger.error('Control plane set failed', { prefix, id: item.id, err: err.message });
    if (IS_PROD) throw new Error('Control plane store unavailable');
    return item;
  }
}

async function getJson(prefix, fallbackMap, itemId) {
  const fallback = fallbackMap.get(itemId) || null;
  if (isPostgresEnabled()) {
    const namespace = namespaceForPrefix(prefix);
    try {
      const row = await pgQuery(
        'select data from meterflow_control_records where namespace = $1 and id = $2',
        [namespace, itemId],
      );
      return row.rows[0]?.data ? normalizeStoredData(row.rows[0].data) : fallback;
    } catch (err) {
      logger.error('Control plane Postgres get failed', { namespace, id: itemId, err: err.message });
      if (IS_PROD) throw new Error('Control plane store unavailable');
      return fallback;
    }
  }

  const r = getRedis();
  if (!r) return fallback;

  try {
    const row = await r.get(`${prefix}${itemId}`);
    return row ? JSON.parse(row) : fallback;
  } catch (err) {
    logger.error('Control plane get failed', { prefix, id: itemId, err: err.message });
    if (IS_PROD) throw new Error('Control plane store unavailable');
    return fallback;
  }
}

async function deleteJson(prefix, fallbackMap, itemId) {
  fallbackMap.delete(itemId);
  if (isPostgresEnabled()) {
    const namespace = namespaceForPrefix(prefix);
    try {
      await pgQuery(
        'delete from meterflow_control_records where namespace = $1 and id = $2',
        [namespace, itemId],
      );
      return;
    } catch (err) {
      logger.error('Control plane Postgres delete failed', { namespace, id: itemId, err: err.message });
      if (IS_PROD) throw new Error('Control plane store unavailable');
      return;
    }
  }

  const r = getRedis();
  if (!r) return;
  try {
    await r.del(`${prefix}${itemId}`);
  } catch (err) {
    logger.error('Control plane delete failed', { prefix, id: itemId, err: err.message });
    if (IS_PROD) throw new Error('Control plane store unavailable');
  }
}

async function getIdempotentReceipt(idempotencyKey) {
  if (!idempotencyKey) return null;
  const receiptId = fallbackIdempotency.get(idempotencyKey);
  if (receiptId) return getReceipt(receiptId);

  if (isPostgresEnabled()) {
    try {
      await pgQuery('delete from meterflow_idempotency where expires_at <= now()');
      const row = await pgQuery(
        'select receipt_id from meterflow_idempotency where scope_key = $1 and expires_at > now()',
        [idempotencyKey],
      );
      return row.rows[0]?.receipt_id ? getReceipt(row.rows[0].receipt_id) : null;
    } catch (err) {
      logger.error('Idempotency Postgres lookup failed', { err: err.message });
      if (IS_PROD) throw new Error('Control plane store unavailable');
      return null;
    }
  }

  const r = getRedis();
  if (!r) return null;
  try {
    const storedId = await r.get(`${IDEMPOTENCY_PREFIX}${idempotencyKey}`);
    return storedId ? getReceipt(storedId) : null;
  } catch (err) {
    logger.error('Idempotency lookup failed', { err: err.message });
    if (IS_PROD) throw new Error('Control plane store unavailable');
    return null;
  }
}

async function setIdempotentReceipt(idempotencyKey, receiptId) {
  if (!idempotencyKey || !receiptId) return;
  fallbackIdempotency.set(idempotencyKey, receiptId);
  if (isPostgresEnabled()) {
    try {
      await pgQuery(
        `insert into meterflow_idempotency (scope_key, receipt_id, expires_at)
         values ($1, $2, now() + interval '1 day')
         on conflict (scope_key) do update set
           receipt_id = excluded.receipt_id,
           expires_at = excluded.expires_at`,
        [idempotencyKey, receiptId],
      );
      return;
    } catch (err) {
      logger.error('Idempotency Postgres write failed', { err: err.message });
      if (IS_PROD) throw new Error('Control plane store unavailable');
      return;
    }
  }

  const r = getRedis();
  if (!r) return;
  try {
    await r.set(`${IDEMPOTENCY_PREFIX}${idempotencyKey}`, receiptId, 'EX', 60 * 60 * 24);
  } catch (err) {
    logger.error('Idempotency write failed', { err: err.message });
    if (IS_PROD) throw new Error('Control plane store unavailable');
  }
}

async function listWebhookRecords(filters = {}) {
  const webhooks = await scanJson(WEBHOOK_PREFIX, fallbackWebhooks);
  return webhooks
    .filter(webhook => !filters.apiKey || webhook.apiKey === filters.apiKey)
    .filter(webhook => !filters.status || webhook.status === filters.status)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

async function deliverWebhook(webhook, event, data) {
  const createdAt = nowIso();
  const body = JSON.stringify({
    id: id('evt'),
    event,
    createdAt,
    data,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto
    .createHmac('sha256', webhook.secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Meterflow-Webhooks/1.0',
        'X-Meterflow-Event': event,
        'X-Meterflow-Timestamp': timestamp,
        'X-Meterflow-Signature': `t=${timestamp},v1=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(8_000),
    });

    const next = {
      ...webhook,
      lastDeliveryAt: createdAt,
      lastDeliveryStatus: response.status,
      lastDeliveryOk: response.ok,
      lastDeliveryError: response.ok ? null : `HTTP ${response.status}`,
      updatedAt: createdAt,
    };
    await setJson(WEBHOOK_PREFIX, fallbackWebhooks, next);
    return { ok: response.ok, status: response.status };
  } catch (err) {
    const next = {
      ...webhook,
      lastDeliveryAt: createdAt,
      lastDeliveryStatus: null,
      lastDeliveryOk: false,
      lastDeliveryError: err.message,
      updatedAt: createdAt,
    };
    await setJson(WEBHOOK_PREFIX, fallbackWebhooks, next).catch(() => {});
    return { ok: false, error: err.message };
  }
}

export async function dispatchWebhookEvent(apiKey, event, data = {}) {
  if (!apiKey || !WEBHOOK_EVENTS.has(event)) return [];
  const webhooks = await listWebhookRecords({ apiKey, status: 'active' });
  const selected = webhooks.filter(webhook => (webhook.events || []).includes(event));
  const results = await Promise.allSettled(selected.map(webhook => deliverWebhook(webhook, event, data)));
  return results.map((result, index) => ({
    webhookId: selected[index]?.id,
    ...(result.status === 'fulfilled' ? result.value : { ok: false, error: result.reason?.message || 'delivery_failed' }),
  }));
}

export async function listMeters(options = {}) {
  const custom = await scanJson(METER_PREFIX, fallbackMeters, options);
  const merged = [...DEFAULT_METERS, ...custom].filter((meter, index, arr) => (
    arr.findLastIndex(other => other.id === meter.id) === index
  ));
  return merged.map(meter => sanitizeMeter({ ...meter, createdAt: meter.createdAt || null, updatedAt: meter.updatedAt || null }));
}

export async function listRawMeters(options = {}) {
  const custom = await scanJson(METER_PREFIX, fallbackMeters, options);
  return [...DEFAULT_METERS, ...custom].filter((meter, index, arr) => (
    arr.findLastIndex(other => other.id === meter.id) === index
  ));
}

export async function listBillableMeters(options = {}) {
  const meters = await listMeters(options);
  return meters.filter(meter =>
    ['live', 'test', 'example'].includes(meter.status)
    && Number(meter.priceUsd) >= 0
    && (meter.asset || 'USDC').toUpperCase() === 'USDC'
  );
}

export async function getMeter(meterId) {
  return sanitizeMeter(await getRawMeter(meterId));
}

export async function getRawMeter(meterId) {
  return DEFAULT_METERS.find(meter => meter.id === meterId) || getJson(METER_PREFIX, fallbackMeters, meterId);
}

export async function createMeter(input, ownerWallet) {
  const ts = nowIso();
  const meterId = id('mtr');
  const target = input.targetUrl ? normalizeTargetUrl(input.targetUrl) : null;
  const route = input.route
    ? normalizePath(input.route)
    : target
      ? `/gateway/${meterId}/*`
      : null;
  if (!route) throw new Error('route is required unless targetUrl is provided.');
  assertZauthObservedMeterRoute(route);

  const saved = await setJson(METER_PREFIX, fallbackMeters, {
    id: meterId,
    route,
    method: (input.method || 'POST').toUpperCase(),
    unit: input.unit || 'request',
    priceUsd: Number(input.priceUsd ?? input.price ?? 0),
    asset: input.asset || 'USDC',
    status: input.status || 'test',
    mode: input.mode || 'test',
    ownerWallet: input.ownerWallet || ownerWallet || 'meterflow',
    policyPreset: input.policyPreset || 'standard',
    source: 'custom',
    targetUrl: target?.targetUrl || null,
    targetHost: target?.targetHost || null,
    providerName: normalizeProviderName(input.providerName),
    upstreamAuth: normalizeUpstreamAuth(input.upstreamAuth),
    createdAt: ts,
    updatedAt: ts,
  });
  return sanitizeMeter(saved);
}

export async function updateMeter(meterId, patch) {
  const current = await getRawMeter(meterId);
  if (!current) return null;
  const nextPatch = { ...patch };
  if (nextPatch.targetUrl) {
    const target = normalizeTargetUrl(nextPatch.targetUrl);
    nextPatch.targetUrl = target.targetUrl;
    nextPatch.targetHost = target.targetHost;
  }
  if (nextPatch.route) {
    nextPatch.route = normalizePath(nextPatch.route);
    assertZauthObservedMeterRoute(nextPatch.route);
  }
  if (nextPatch.upstreamAuth) nextPatch.upstreamAuth = normalizeUpstreamAuth(nextPatch.upstreamAuth);
  if (nextPatch.providerName !== undefined) nextPatch.providerName = normalizeProviderName(nextPatch.providerName);
  if (current.source === 'default') {
    const copy = { ...current, source: 'custom', updatedAt: nowIso(), ...nextPatch };
    return sanitizeMeter(await setJson(METER_PREFIX, fallbackMeters, copy));
  }
  return sanitizeMeter(await setJson(METER_PREFIX, fallbackMeters, { ...current, ...nextPatch, updatedAt: nowIso() }));
}

export async function deleteMeter(meterId) {
  const current = await getMeter(meterId);
  if (!current || current.source === 'default') return false;
  await deleteJson(METER_PREFIX, fallbackMeters, meterId);
  return true;
}

export function canManageResource(resource, wallet, apiKey) {
  if (!resource) return false;
  if (resource.source === 'default') return true;
  return resource.ownerWallet === wallet || resource.operatorWallet === wallet || resource.apiKey === apiKey;
}

export async function findMeterForRequest(method, requestPath) {
  const normalized = normalizePath(requestPath);
  const meters = await listRawMeters();
  return meters.find(meter => {
    if (meter.status === 'paused') return false;
    if ((meter.method || 'GET').toUpperCase() !== method.toUpperCase()) return false;
    if (meter.route.endsWith('*')) return normalized.startsWith(meter.route.slice(0, -1));
    return normalizePath(meter.route) === normalized;
  }) || null;
}

export async function listReceipts(filters = {}) {
  const receipts = await scanJson(RECEIPT_PREFIX, fallbackReceipts);
  return receipts
    .filter(receipt => !filters.meterId || receipt.meterId === filters.meterId)
    .filter(receipt => !filters.status || receipt.status === filters.status)
    .filter(receipt => !filters.wallet || receipt.wallet === filters.wallet || receipt.payerWallet === filters.wallet || receipt.agent === filters.wallet)
    .filter(receipt => !filters.apiKey || receipt.apiKey === filters.apiKey)
    .filter(receipt => !filters.txSignature || receipt.txSignature === filters.txSignature)
    .filter(receipt => !filters.idempotencyKey || receipt.idempotencyKey === filters.idempotencyKey)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, Math.min(Number(filters.limit) || 100, 500));
}

export async function listReceiptsForPrincipal({ apiKey, wallet, limit = 100, ...filters } = {}) {
  const [byKey, byWallet] = await Promise.all([
    apiKey ? listReceipts({ ...filters, apiKey, limit }) : [],
    wallet ? listReceipts({ ...filters, wallet, limit }) : [],
  ]);
  return [...byKey, ...byWallet]
    .filter((receipt, index, rows) => rows.findIndex(row => row.id === receipt.id) === index)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, Math.min(Number(limit) || 100, 500));
}

export async function getReceipt(receiptId) {
  return getJson(RECEIPT_PREFIX, fallbackReceipts, receiptId);
}

export async function updateReceipt(receiptId, patch = {}) {
  const current = await getReceipt(receiptId);
  if (!current) return null;
  return setJson(RECEIPT_PREFIX, fallbackReceipts, {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: nowIso(),
  });
}

export async function recordReceipt(input) {
  const scopedIdempotencyKey = input.idempotencyKey
    ? `${input.apiKey || input.wallet || 'global'}:${input.idempotencyKey}`
    : null;

  if (scopedIdempotencyKey) {
    const existing = await getIdempotentReceipt(scopedIdempotencyKey);
    if (existing) return existing;
  }

  const ts = nowIso();
  const receipt = {
    id: input.id || id(isFailureReceiptStatus(input.status) ? 'fail' : 'rcpt'),
    meterId: input.meterId || null,
    route: input.route || null,
    method: input.method || null,
    status: input.status || 'metered_key',
    amountUsd: Number(input.amountUsd || 0),
    baseAmountUsd: Number(input.baseAmountUsd ?? input.amountUsd ?? 0),
    protocolFeeUsd: Number(input.protocolFeeUsd || 0),
    protocolFeeBps: Number(input.protocolFeeBps || 0),
    asset: input.asset || 'USDC',
    wallet: input.wallet || null,
    apiKey: input.apiKey || null,
    apiKeyMasked: maskKey(input.apiKey),
    agent: input.agent || input.wallet || null,
    quoteId: input.quoteId || id('quote'),
    idempotencyKey: input.idempotencyKey || null,
    paymentState: input.paymentState || 'not_required',
    paymentProtocol: input.paymentProtocol || input.protocol || 'meterflow',
    paymentIntent: input.paymentIntent || input.intent || null,
    paymentMethod: input.paymentMethod || input.methodName || null,
    paymentNetwork: input.paymentNetwork || input.network || 'solana-mainnet-beta',
    paymentMint: input.paymentMint || input.mint || null,
    payTo: input.payTo || null,
    payerWallet: input.payerWallet || input.wallet || null,
    txSignature: input.txSignature || input.signature || null,
    paymentReference: input.paymentReference || input.reference || input.txSignature || input.signature || null,
    quoteExpiresAt: input.quoteExpiresAt || null,
    requestHash: input.requestHash || null,
    policyResult: input.policyResult || 'allowed',
    responseStatus: input.responseStatus || null,
    latencyMs: input.latencyMs || null,
    tokens: input.tokens || 0,
    error: input.error || null,
    createdAt: ts,
  };
  const saved = await setJson(RECEIPT_PREFIX, fallbackReceipts, receipt);
  await setIdempotentReceipt(scopedIdempotencyKey, saved.id);
  dispatchWebhookEvent(saved.apiKey, 'receipt.created', { receipt: saved }).catch(err => {
    logger.warn('Receipt webhook dispatch failed', { receiptId: saved.id, err: err.message });
  });
  if (saved.paymentState === 'verified') {
    dispatchWebhookEvent(saved.apiKey, 'receipt.verified', { receipt: saved }).catch(err => {
      logger.warn('Verified receipt webhook dispatch failed', { receiptId: saved.id, err: err.message });
    });
    dispatchWebhookEvent(saved.apiKey, 'payment.verified', { receipt: saved }).catch(err => {
      logger.warn('Payment webhook dispatch failed', { receiptId: saved.id, err: err.message });
    });
  }
  if (isFailureReceiptStatus(saved.status)) {
    dispatchWebhookEvent(saved.apiKey, 'payment.failed', { receipt: saved }).catch(err => {
      logger.warn('Payment failure webhook dispatch failed', { receiptId: saved.id, err: err.message });
    });
  }
  if (saved.policyResult === 'budget_exhausted') {
    dispatchWebhookEvent(saved.apiKey, 'budget.exhausted', { receipt: saved }).catch(err => {
      logger.warn('Budget webhook dispatch failed', { receiptId: saved.id, err: err.message });
    });
  }
  return saved;
}

export async function listBudgets(filters = {}) {
  const budgets = await scanJson(BUDGET_PREFIX, fallbackBudgets);
  return budgets
    .filter(budget => !filters.apiKey || budget.apiKey === filters.apiKey)
    .filter(budget => !filters.wallet || budget.operatorWallet === filters.wallet)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

export async function getBudget(budgetId) {
  return getJson(BUDGET_PREFIX, fallbackBudgets, budgetId);
}

export async function createBudget(input, apiKey, operatorWallet) {
  const ts = nowIso();
  const policy = normalizeBudgetPolicy(input);
  return setJson(BUDGET_PREFIX, fallbackBudgets, {
    id: id('bdg'),
    name: input.name || 'Agent budget',
    apiKey,
    operatorWallet,
    agentId: policy.agentId,
    dailyCapUsd: policy.dailyCapUsd,
    perCallCapUsd: policy.perCallCapUsd,
    allowedMeterIds: policy.allowedMeterIds,
    allowedRoutes: policy.allowedRoutes,
    allowedRails: policy.allowedRails,
    deniedProviderIds: policy.deniedProviderIds,
    mode: policy.mode,
    piiGuard: policy.piiGuard,
    requireReceipt: policy.requireReceipt,
    approvalThresholdUsd: policy.approvalThresholdUsd,
    status: input.status || 'active',
    spentUsdToday: 0,
    spentDate: todayKey(),
    onExhausted: policy.onExhausted,
    createdAt: ts,
    updatedAt: ts,
  });
}

export async function updateBudget(budgetId, patch) {
  const current = await getBudget(budgetId);
  if (!current) return null;
  const policy = normalizeBudgetPolicy({ ...current, ...patch });
  const next = {
    ...current,
    ...patch,
    ...policy,
    status: patch.status || current.status,
    updatedAt: nowIso(),
  };
  return setJson(BUDGET_PREFIX, fallbackBudgets, next);
}

export async function revokeBudget(budgetId) {
  return updateBudget(budgetId, { status: 'revoked' });
}

export async function getActiveBudgetForApiKey(apiKey, agentId = null) {
  const budgets = await listBudgets({ apiKey });
  const active = budgets.filter(budget => budget.status === 'active');
  if (agentId) {
    return active.find(budget => budget.agentId === agentId) || active.find(budget => budget.agentId === 'default-agent') || null;
  }
  return active.find(budget => budget.agentId === 'default-agent') || active[0] || null;
}

export async function addBudgetSpend(budgetId, amountUsd) {
  const budget = await getBudget(budgetId);
  if (!budget) return null;
  const date = todayKey();
  const spentUsdToday = budget.spentDate === date
    ? Number(budget.spentUsdToday || 0) + Number(amountUsd || 0)
    : Number(amountUsd || 0);
  return updateBudget(budgetId, { spentUsdToday, spentDate: date });
}

function policyDecision({ allowed, status = 200, error = null, message = null, policyResult = 'allowed', details = {} }) {
  return { allowed, status, error, message, policyResult, ...details };
}

export async function evaluateAgentSpendPolicy(input = {}, principal = {}) {
  const method = String(input.method || 'GET').toUpperCase();
  const route = normalizePath(input.route || input.path || '/');
  const agentId = String(input.agentId || principal.agentId || 'default-agent').trim() || 'default-agent';
  const paymentProtocol = normalizePaymentRail(input.paymentProtocol || input.rail || 'x402');
  const meter = input.meterId ? await getMeter(input.meterId) : await findMeterForRequest(method, route);
  const amountUsd = Number(input.amountUsd ?? meter?.priceUsd ?? 0);
  const economics = applyProtocolFee(amountUsd, principal);
  const budget = await getActiveBudgetForApiKey(principal.apiKey, agentId);
  const recommendation = recommendPaymentPath({
    ...input,
    paymentProtocol,
    piiGuard: budget?.piiGuard,
    requireReceipt: budget?.requireReceipt,
  });
  const metadataHash = hashMetadata(input.metadata);
  const context = {
    meter,
    budget,
    economics,
    recommendation,
    metadata: metadataHash ? { hash: metadataHash, piiGuardApplied: budget?.piiGuard !== false } : null,
  };

  if (!meter) {
    return policyDecision({
      allowed: true,
      policyResult: 'unmetered',
      details: context,
    });
  }

  if (!budget) {
    return policyDecision({
      allowed: true,
      policyResult: 'allowed_no_budget',
      details: context,
    });
  }

  const date = todayKey();
  const spent = budget.spentDate === date ? Number(budget.spentUsdToday || 0) : 0;
  const price = economics.totalAmountUsd;
  const allowedIds = budget.allowedMeterIds || [];
  const allowedRoutes = budget.allowedRoutes || [];
  const allowedRails = budget.allowedRails || [];
  const providerId = input.providerId || meter.providerId || meter.providerName || null;

  let denied = null;
  if (allowedIds.length > 0 && !allowedIds.includes(meter.id)) {
    denied = { status: 403, error: 'policy_denied', message: 'This agent budget does not allow the requested meter.' };
  } else if (allowedRoutes.length > 0 && !routeMatchesPolicy(meter.route || route, allowedRoutes) && !routeMatchesPolicy(route, allowedRoutes)) {
    denied = { status: 403, error: 'route_not_allowed', message: 'This agent budget does not allow the requested route.' };
  } else if (allowedRails.length > 0 && !allowedRails.includes(paymentProtocol)) {
    denied = { status: 403, error: 'rail_not_allowed', message: 'This agent budget does not allow the requested payment rail.' };
  } else if (providerId && (budget.deniedProviderIds || []).includes(providerId)) {
    denied = { status: 403, error: 'provider_denied', message: 'This provider is blocked by the active agent budget.' };
  } else if (budget.perCallCapUsd > 0 && price > Number(budget.perCallCapUsd)) {
    denied = { status: 403, error: 'per_call_cap_exceeded', message: 'This request exceeds the agent per-call cap.' };
  } else if (budget.dailyCapUsd > 0 && spent + price > Number(budget.dailyCapUsd)) {
    denied = { status: 429, error: 'budget_exhausted', message: 'This agent budget has reached its daily spend cap.' };
  } else if (budget.approvalThresholdUsd > 0 && price > Number(budget.approvalThresholdUsd)) {
    denied = { status: 403, error: 'approval_required', message: 'This request requires operator approval before payment.' };
  }

  if (denied) {
    const monitor = budget.mode === 'monitor';
    return policyDecision({
      allowed: monitor,
      status: monitor ? 200 : denied.status,
      error: denied.error,
      message: denied.message,
      policyResult: monitor ? `monitor_${denied.error}` : denied.error,
      details: {
        ...context,
        enforcement: monitor ? 'monitor' : 'enforce',
        spentUsdToday: spent,
        projectedSpendUsdToday: +(spent + price).toFixed(6),
      },
    });
  }

  return policyDecision({
    allowed: true,
    policyResult: 'allowed',
    details: {
      ...context,
      enforcement: budget.mode || 'enforce',
      spentUsdToday: spent,
      projectedSpendUsdToday: +(spent + price).toFixed(6),
    },
  });
}

export async function authorizeMeteredRequest(req) {
  return evaluateAgentSpendPolicy({
    method: req.method,
    route: req.originalUrl || req.path,
    agentId: header(req, 'x-meterflow-agent-id') || req.meterflow?.wallet || 'default-agent',
    paymentProtocol: header(req, 'x-meterflow-payment-protocol') || (req.meterflow?.paymentVerified ? 'x402' : 'api-key'),
  }, req.meterflow);
}

export async function completeMeteredRequest(req, result = {}) {
  const ctx = req.meterflowControl || {};
  const meter = ctx.meter || await findMeterForRequest(req.method, req.originalUrl || req.path);
  if (!meter) return null;

  const initialPaymentState = result.paymentState || ctx.paymentState || 'legacy_key_metered';
  const isVerified = initialPaymentState === 'verified';
  const status = isVerified && result.status === 'metered_key'
    ? 'verified'
    : (result.status || (isVerified ? 'verified' : 'metered_key'));
  const paymentState = isVerified && status !== 'verified' && status !== 'metered_key'
    ? 'verified_unsettled'
    : initialPaymentState;
  const economics = result.economics || ctx.economics || applyProtocolFee(meter.priceUsd, req.meterflow);
  const isBillable = status === 'metered_key' || status === 'verified';
  const amountUsd = result.amountUsd ?? (isBillable ? economics.totalAmountUsd : 0);
  const idempotencyKey = result.idempotencyKey || header(req, 'idempotency-key') || header(req, 'x-request-id') || null;
  const txSignature = result.txSignature || ctx.txSignature || header(req, 'x-payment-transaction') || header(req, 'x-payment-signature') || header(req, 'x-transaction-signature') || null;
  if (ctx.budget && isBillable) {
    await addBudgetSpend(ctx.budget.id, amountUsd);
  }

  const receipt = await recordReceipt({
    meterId: meter.id,
    route: meter.route,
    method: meter.method,
    status,
    amountUsd,
    baseAmountUsd: isBillable ? economics.baseAmountUsd : 0,
    protocolFeeUsd: isBillable ? economics.protocolFeeUsd : 0,
    protocolFeeBps: economics.protocolFeeBps,
    asset: meter.asset,
    wallet: req.meterflow?.wallet || null,
    apiKey: req.meterflow?.apiKey || null,
    agent: ctx.budget?.agentId || req.meterflow?.wallet || null,
    quoteId: result.quoteId || ctx.quoteId,
    idempotencyKey,
    paymentState,
    paymentProtocol: result.paymentProtocol || ctx.paymentProtocol || (req.meterflow?.paymentVerified ? 'x402' : 'meterflow'),
    paymentIntent: result.paymentIntent || ctx.paymentIntent || null,
    paymentMethod: result.paymentMethod || ctx.paymentMethod || null,
    paymentNetwork: result.paymentNetwork || ctx.paymentNetwork || 'solana-mainnet-beta',
    paymentMint: result.paymentMint || ctx.paymentMint,
    payTo: result.payTo || ctx.payTo,
    payerWallet: result.payerWallet || ctx.payerWallet || req.meterflow?.wallet || null,
    txSignature,
    paymentReference: result.paymentReference || ctx.paymentReference || txSignature,
    quoteExpiresAt: result.quoteExpiresAt || ctx.quoteExpiresAt,
    requestHash: result.requestHash || requestHash(req),
    policyResult: result.policyResult || ctx.policyResult || 'allowed',
    responseStatus: result.responseStatus || null,
    latencyMs: result.latencyMs || null,
    tokens: result.tokens || 0,
    error: result.error || null,
  });
  ctx.receiptId = receipt.id;
  return receipt;
}

export async function getProviderRevenue() {
  const [meters, receipts] = await Promise.all([listMeters(), listReceipts({ limit: 500 })]);
  return meters.map(meter => {
    const rows = receipts.filter(receipt => receipt.meterId === meter.id);
    const successful = rows.filter(receipt => receipt.status === 'metered_key' || receipt.status === 'verified');
    const failed = rows.filter(receipt => receipt.status !== 'metered_key' && receipt.status !== 'verified');
    const grossUsd = successful.reduce((sum, receipt) => sum + Number(receipt.amountUsd || 0), 0);
    const avgLatencyMs = successful.length
      ? Math.round(successful.reduce((sum, receipt) => sum + Number(receipt.latencyMs || 0), 0) / successful.length)
      : 0;
    return {
      meterId: meter.id,
      route: meter.route,
      unit: meter.unit,
      calls: rows.length,
      successful: successful.length,
      failed: failed.length,
      grossUsd,
      verifiedUsd: successful.filter(receipt => receipt.paymentState === 'verified').reduce((sum, receipt) => sum + Number(receipt.amountUsd || 0), 0),
      estimatedUsd: grossUsd,
      avgLatencyMs,
    };
  }).sort((a, b) => b.grossUsd - a.grossUsd);
}

export async function listMcpTools(filters = {}) {
  const tools = await scanJson(MCP_TOOL_PREFIX, fallbackMcpTools);
  return tools
    .filter(tool => !filters.apiKey || tool.apiKey === filters.apiKey)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

export async function getMcpTool(toolId) {
  return getJson(MCP_TOOL_PREFIX, fallbackMcpTools, toolId);
}

export async function createMcpTool(input, apiKey, ownerWallet) {
  const ts = nowIso();
  const tool = await setJson(MCP_TOOL_PREFIX, fallbackMcpTools, {
    id: id('mcp'),
    name: input.name || 'Metered MCP tool',
    manifestUrl: input.manifestUrl || '',
    route: input.route || `/mcp/${String(input.name || 'tool').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    priceUsd: Number(input.priceUsd || 0.006),
    policyPreset: input.policyPreset || 'standard',
    status: input.status || 'test',
    ownerWallet,
    apiKey,
    createdAt: ts,
    updatedAt: ts,
  });

  return tool;
}

export async function deleteMcpTool(toolId) {
  return deleteJson(MCP_TOOL_PREFIX, fallbackMcpTools, toolId);
}

export async function listWebhooks(filters = {}) {
  const records = await listWebhookRecords(filters);
  return records.map(webhook => sanitizeWebhook(webhook));
}

export async function getWebhook(webhookId) {
  return getJson(WEBHOOK_PREFIX, fallbackWebhooks, webhookId);
}

export async function createWebhook(input, apiKey, ownerWallet) {
  const ts = nowIso();
  const events = normalizeWebhookEvents(input.events);
  if (!events.length) {
    throw new Error('At least one valid webhook event is required.');
  }

  const webhook = await setJson(WEBHOOK_PREFIX, fallbackWebhooks, {
    id: id('wh'),
    url: normalizeWebhookUrl(input.url),
    events,
    secret: input.secret || webhookSecret(),
    status: input.status || 'active',
    apiKey,
    ownerWallet,
    createdAt: ts,
    updatedAt: ts,
    lastDeliveryAt: null,
    lastDeliveryStatus: null,
    lastDeliveryOk: null,
    lastDeliveryError: null,
  });

  return sanitizeWebhook(webhook, true);
}

export async function deleteWebhook(webhookId) {
  return deleteJson(WEBHOOK_PREFIX, fallbackWebhooks, webhookId);
}

export async function sendWebhookTest(webhookId, apiKey) {
  const webhook = await getWebhook(webhookId);
  if (!webhook || webhook.apiKey !== apiKey) return null;
  return deliverWebhook(webhook, 'webhook.test', {
    ok: true,
    message: 'Meterflow webhook test event',
  });
}
