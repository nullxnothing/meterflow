import crypto from 'crypto';
import { CONFIG } from '../config.js';
import { getRedis } from './redis.js';
import { logger } from './logger.js';

const IS_PROD = process.env.NODE_ENV === 'production';
const METER_PREFIX = 'meterflow:meter:';
const RECEIPT_PREFIX = 'meterflow:receipt:';
const BUDGET_PREFIX = 'meterflow:budget:';
const MCP_TOOL_PREFIX = 'meterflow:mcp-tool:';

const fallbackMeters = new Map();
const fallbackReceipts = new Map();
const fallbackBudgets = new Map();
const fallbackMcpTools = new Map();

const DEFAULT_METERS = [
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

async function scanJson(prefix, fallbackMap) {
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
    logger.error('Control plane scan failed', { prefix, err: err.message });
    if (IS_PROD) throw new Error('Control plane store unavailable');
    return [...fallbackMap.values()];
  }
}

async function setJson(prefix, fallbackMap, item) {
  fallbackMap.set(item.id, item);
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
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(`${prefix}${itemId}`);
  } catch (err) {
    logger.error('Control plane delete failed', { prefix, id: itemId, err: err.message });
    if (IS_PROD) throw new Error('Control plane store unavailable');
  }
}

export async function listMeters() {
  const custom = await scanJson(METER_PREFIX, fallbackMeters);
  const merged = [...DEFAULT_METERS, ...custom].filter((meter, index, arr) => (
    arr.findLastIndex(other => other.id === meter.id) === index
  ));
  return merged.map(meter => ({ ...meter, createdAt: meter.createdAt || null, updatedAt: meter.updatedAt || null }));
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
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, Math.min(Number(filters.limit) || 100, 500));
}

export async function getReceipt(receiptId) {
  return getJson(RECEIPT_PREFIX, fallbackReceipts, receiptId);
}

export async function recordReceipt(input) {
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
    paymentState: input.paymentState || 'not_required',
    policyResult: input.policyResult || 'allowed',
    responseStatus: input.responseStatus || null,
    latencyMs: input.latencyMs || null,
    tokens: input.tokens || 0,
    error: input.error || null,
    createdAt: ts,
  };
  return setJson(RECEIPT_PREFIX, fallbackReceipts, receipt);
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
  return setJson(BUDGET_PREFIX, fallbackBudgets, { ...current, ...patch, updatedAt: nowIso() });
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
  const status = result.status || (isVerified ? 'verified' : 'metered_key');
  const economics = result.economics || ctx.economics || applyProtocolFee(meter.priceUsd, req.meterflow?.tier);
  const isBillable = status === 'metered_key' || status === 'verified';
  const amountUsd = result.amountUsd ?? (isBillable ? economics.totalAmountUsd : 0);
  if (ctx.budget && isBillable) {
    await addBudgetSpend(ctx.budget.id, amountUsd);
  }

  return recordReceipt({
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
    paymentState,
    policyResult: result.policyResult || ctx.policyResult || 'allowed',
    responseStatus: result.responseStatus || null,
    latencyMs: result.latencyMs || null,
    tokens: result.tokens || 0,
    error: result.error || null,
  });
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
