import crypto from 'crypto';
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
  'payment.verified',
  'payment.failed',
  'budget.exhausted',
  'webhook.test',
]);

export const DEFAULT_METERS = [
  { id: 'mtr_chat', route: '/v1/chat', method: 'POST', unit: 'model call', priceUsd: 0.004, asset: 'USDC', status: 'live', mode: 'live', ownerWallet: 'meterflow', source: 'default' },
  { id: 'mtr_chat_stream', route: '/v1/chat/stream', method: 'POST', unit: 'streaming model call', priceUsd: 0.004, asset: 'USDC', status: 'live', mode: 'live', ownerWallet: 'meterflow', source: 'default' },
  { id: 'mtr_multi', route: '/v1/multi', method: 'POST', unit: 'multi-model call', priceUsd: 0.012, asset: 'USDC', status: 'live', mode: 'live', ownerWallet: 'meterflow', source: 'default' },
  { id: 'mtr_multi_stream', route: '/v1/multi/stream', method: 'POST', unit: 'multi-model stream', priceUsd: 0.012, asset: 'USDC', status: 'live', mode: 'live', ownerWallet: 'meterflow', source: 'default' },
  { id: 'mtr_image', route: '/v1/image', method: 'POST', unit: 'generation', priceUsd: 0.08, asset: 'USDC', status: 'example', mode: 'test', ownerWallet: 'meterflow', source: 'default' },
  { id: 'mtr_video', route: '/v1/video/generate', method: 'POST', unit: 'video job', priceUsd: 0.35, asset: 'USDC', status: 'example', mode: 'test', ownerWallet: 'meterflow', source: 'default' },
  { id: 'mtr_alpha', route: '/v1/alpha/*', method: 'GET', unit: 'alpha request', priceUsd: 0.012, asset: 'USDC', status: 'example', mode: 'test', ownerWallet: 'meterflow', source: 'default' },
  { id: 'mtr_mcp_token_risk', route: '/mcp/token-risk', method: 'POST', unit: 'MCP tool call', priceUsd: 0.006, asset: 'USDC', status: 'live', mode: 'live', ownerWallet: 'meterflow', source: 'default' },
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

function getProtocolFeeBps(tier) {
  return tier && tier !== 'trial'
    ? Number(CONFIG.HOLDER_PROTOCOL_FEE_BPS || 0)
    : Number(CONFIG.PROTOCOL_FEE_BPS || 0);
}

export function applyProtocolFee(amountUsd, tier) {
  const baseAmountUsd = Number(amountUsd || 0);
  const protocolFeeBps = getProtocolFeeBps(tier);
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
  if (clean.startsWith('/v1/video/')) return clean;
  return clean.replace(/\/$/, '') || '/';
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
  return merged.map(meter => ({ ...meter, createdAt: meter.createdAt || null, updatedAt: meter.updatedAt || null }));
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
  return DEFAULT_METERS.find(meter => meter.id === meterId) || getJson(METER_PREFIX, fallbackMeters, meterId);
}

export async function createMeter(input, ownerWallet) {
  const ts = nowIso();
  return setJson(METER_PREFIX, fallbackMeters, {
    id: id('mtr'),
    route: normalizePath(input.route),
    method: (input.method || 'POST').toUpperCase(),
    unit: input.unit || 'request',
    priceUsd: Number(input.priceUsd ?? input.price ?? 0),
    asset: input.asset || 'USDC',
    status: input.status || 'test',
    mode: input.mode || 'test',
    ownerWallet: input.ownerWallet || ownerWallet || 'meterflow',
    policyPreset: input.policyPreset || 'standard',
    source: 'custom',
    createdAt: ts,
    updatedAt: ts,
  });
}

export async function updateMeter(meterId, patch) {
  const current = await getMeter(meterId);
  if (!current) return null;
  if (current.source === 'default') {
    const copy = { ...current, source: 'custom', updatedAt: nowIso(), ...patch };
    return setJson(METER_PREFIX, fallbackMeters, copy);
  }
  return setJson(METER_PREFIX, fallbackMeters, { ...current, ...patch, updatedAt: nowIso() });
}

export function canManageResource(resource, wallet, apiKey) {
  if (!resource) return false;
  if (resource.source === 'default') return true;
  return resource.ownerWallet === wallet || resource.operatorWallet === wallet || resource.apiKey === apiKey;
}

export async function findMeterForRequest(method, requestPath) {
  const normalized = normalizePath(requestPath);
  const meters = await listMeters();
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
    .filter(receipt => !filters.wallet || receipt.wallet === filters.wallet)
    .filter(receipt => !filters.apiKey || receipt.apiKey === filters.apiKey)
    .filter(receipt => !filters.txSignature || receipt.txSignature === filters.txSignature)
    .filter(receipt => !filters.idempotencyKey || receipt.idempotencyKey === filters.idempotencyKey)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, Math.min(Number(filters.limit) || 100, 500));
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
    id: input.id || id(input.status?.startsWith('fail') || input.status?.includes('denied') ? 'fail' : 'rcpt'),
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
    paymentNetwork: input.paymentNetwork || input.network || 'solana-mainnet-beta',
    paymentMint: input.paymentMint || input.mint || null,
    payTo: input.payTo || null,
    payerWallet: input.payerWallet || input.wallet || null,
    txSignature: input.txSignature || input.signature || null,
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
    dispatchWebhookEvent(saved.apiKey, 'payment.verified', { receipt: saved }).catch(err => {
      logger.warn('Payment webhook dispatch failed', { receiptId: saved.id, err: err.message });
    });
  }
  if (saved.status !== 'metered_key' && saved.status !== 'verified') {
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
  return setJson(BUDGET_PREFIX, fallbackBudgets, {
    id: id('bdg'),
    name: input.name || 'Agent budget',
    apiKey,
    operatorWallet,
    agentId: input.agentId || 'default-agent',
    dailyCapUsd: Number(input.dailyCapUsd || 12),
    perCallCapUsd: Number(input.perCallCapUsd || 0.02),
    allowedMeterIds: Array.isArray(input.allowedMeterIds) ? input.allowedMeterIds : [],
    status: input.status || 'active',
    spentUsdToday: 0,
    spentDate: todayKey(),
    onExhausted: input.onExhausted || 'stop_workflow',
    createdAt: ts,
    updatedAt: ts,
  });
}

export async function updateBudget(budgetId, patch) {
  const current = await getBudget(budgetId);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: nowIso() };
  if (patch.dailyCapUsd !== undefined) next.dailyCapUsd = Number(patch.dailyCapUsd);
  if (patch.perCallCapUsd !== undefined) next.perCallCapUsd = Number(patch.perCallCapUsd);
  if (patch.allowedMeterIds !== undefined && !Array.isArray(patch.allowedMeterIds)) next.allowedMeterIds = [];
  return setJson(BUDGET_PREFIX, fallbackBudgets, next);
}

export async function revokeBudget(budgetId) {
  return updateBudget(budgetId, { status: 'revoked' });
}

export async function getActiveBudgetForApiKey(apiKey) {
  const budgets = await listBudgets({ apiKey });
  return budgets.find(budget => budget.status === 'active') || null;
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

export async function authorizeMeteredRequest(req) {
  const meter = await findMeterForRequest(req.method, req.originalUrl || req.path);
  if (!meter) return { allowed: true, meter: null, budget: null, policyResult: 'unmetered' };

  const budget = await getActiveBudgetForApiKey(req.meterflow.apiKey);
  const economics = applyProtocolFee(meter.priceUsd, req.meterflow?.tier);
  if (!budget) return { allowed: true, meter, budget: null, policyResult: 'allowed_no_budget', economics };

  const date = todayKey();
  const spent = budget.spentDate === date ? Number(budget.spentUsdToday || 0) : 0;
  const price = economics.totalAmountUsd;
  const allowedIds = budget.allowedMeterIds || [];

  if (allowedIds.length > 0 && !allowedIds.includes(meter.id)) {
    return { allowed: false, meter, budget, status: 403, error: 'policy_denied', message: 'This agent budget does not allow the requested meter.' };
  }
  if (budget.perCallCapUsd > 0 && price > Number(budget.perCallCapUsd)) {
    return { allowed: false, meter, budget, status: 403, error: 'per_call_cap_exceeded', message: 'This request exceeds the agent per-call cap.' };
  }
  if (budget.dailyCapUsd > 0 && spent + price > Number(budget.dailyCapUsd)) {
    return { allowed: false, meter, budget, status: 429, error: 'budget_exhausted', message: 'This agent budget has reached its daily spend cap.' };
  }

  return { allowed: true, meter, budget, policyResult: 'allowed', economics };
}

export async function completeMeteredRequest(req, result = {}) {
  const ctx = req.meterflowControl || {};
  const meter = ctx.meter || await findMeterForRequest(req.method, req.originalUrl || req.path);
  if (!meter) return null;

  const paymentState = result.paymentState || ctx.paymentState || 'legacy_key_metered';
  const isVerified = paymentState === 'verified';
  const status = isVerified && result.status === 'metered_key'
    ? 'verified'
    : (result.status || (isVerified ? 'verified' : 'metered_key'));
  const economics = result.economics || ctx.economics || applyProtocolFee(meter.priceUsd, req.meterflow?.tier);
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
    paymentNetwork: result.paymentNetwork || ctx.paymentNetwork || 'solana-mainnet-beta',
    paymentMint: result.paymentMint || ctx.paymentMint,
    payTo: result.payTo || ctx.payTo,
    payerWallet: result.payerWallet || ctx.payerWallet || req.meterflow?.wallet || null,
    txSignature,
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
