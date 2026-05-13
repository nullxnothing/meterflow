import crypto from 'crypto';
import { CONFIG } from '../config.js';
import { getRedis } from './redis.js';
import { isPostgresEnabled, query as pgQuery } from './postgres.js';
import { logger } from './logger.js';

const IS_PROD = process.env.NODE_ENV === 'production';
const APPLICATION_PREFIX = 'meterflow:provider-application:';
const APPLICATION_NAMESPACE = 'provider_application';
const fallbackApplications = new Map();

const STATUS_VALUES = new Set(['new', 'reviewing', 'accepted', 'rejected', 'archived']);
const PRIORITY_VALUES = new Set(['low', 'normal', 'high', 'launch_partner']);

function nowIso() {
  return new Date().toISOString();
}

function id() {
  return `app_${crypto.randomBytes(6).toString('hex')}`;
}

function text(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function normalizeStatus(value, fallback = 'new') {
  const status = text(value, 40).toLowerCase();
  return STATUS_VALUES.has(status) ? status : fallback;
}

function normalizePriority(value, fallback = 'normal') {
  const priority = text(value, 40).toLowerCase();
  return PRIORITY_VALUES.has(priority) ? priority : fallback;
}

function normalizeStoredData(data) {
  return typeof data === 'string' ? JSON.parse(data) : data;
}

function storageColumns(item = {}) {
  return {
    apiKey: null,
    ownerWallet: item.contact || item.email || null,
    route: item.endpoint || null,
    status: item.status || null,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || item.createdAt || null,
  };
}

async function scanApplications() {
  if (isPostgresEnabled()) {
    try {
      const rows = await pgQuery(
        `select data
           from meterflow_control_records
          where namespace = $1
          order by coalesce(updated_at, created_at) desc nulls last`,
        [APPLICATION_NAMESPACE],
      );
      const postgresRows = rows.rows.map(row => normalizeStoredData(row.data));
      return [...postgresRows, ...fallbackApplications.values()].filter((item, index, arr) => (
        arr.findIndex(other => other.id === item.id) === index
      ));
    } catch (err) {
      logger.error('Provider application Postgres scan failed', { err: err.message });
      if (IS_PROD) throw new Error('Application store unavailable');
      return [...fallbackApplications.values()];
    }
  }

  const r = getRedis();
  if (!r) return [...fallbackApplications.values()];

  try {
    const keys = [];
    let cursor = '0';
    do {
      const [next, batch] = await r.scan(cursor, 'MATCH', `${APPLICATION_PREFIX}*`, 'COUNT', 200);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');

    if (keys.length === 0) return [...fallbackApplications.values()];

    const pipeline = r.pipeline();
    for (const key of keys) pipeline.get(key);
    const rows = await pipeline.exec();
    const redisRows = rows
      .map(row => row?.[1])
      .filter(Boolean)
      .map(row => JSON.parse(row));

    return [...redisRows, ...fallbackApplications.values()].filter((item, index, arr) => (
      arr.findIndex(other => other.id === item.id) === index
    ));
  } catch (err) {
    logger.error('Provider application Redis scan failed', { err: err.message });
    if (IS_PROD) throw new Error('Application store unavailable');
    return [...fallbackApplications.values()];
  }
}

async function setApplication(item) {
  fallbackApplications.set(item.id, item);

  if (isPostgresEnabled()) {
    const cols = storageColumns(item);
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
          APPLICATION_NAMESPACE,
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
      logger.error('Provider application Postgres write failed', { id: item.id, err: err.message });
      if (IS_PROD) throw new Error('Application store unavailable');
      return item;
    }
  }

  const r = getRedis();
  if (!r) return item;

  try {
    await r.set(`${APPLICATION_PREFIX}${item.id}`, JSON.stringify(item));
    return item;
  } catch (err) {
    logger.error('Provider application Redis write failed', { id: item.id, err: err.message });
    if (IS_PROD) throw new Error('Application store unavailable');
    return item;
  }
}

export function normalizeApplicationInput(input = {}) {
  return {
    projectName: text(input.projectName, 160),
    founderName: text(input.founderName, 120),
    contact: text(input.contact, 180),
    contactType: text(input.contactType, 60),
    email: text(input.email, 180),
    xHandle: text(input.xHandle, 120),
    telegram: text(input.telegram, 120),
    website: text(input.website, 220),
    category: text(input.category, 120),
    endpoint: text(input.endpoint, 260),
    chargingModel: text(input.chargingModel, 120),
    protocolSupport: text(input.protocolSupport, 160),
    audience: text(input.audience, 500),
    liveStatus: text(input.liveStatus, 120),
    currentBilling: text(input.currentBilling, 300),
    notes: text(input.notes, 2500),
    monthlyVolumeEstimate: number(input.monthlyVolumeEstimate, 0),
    expectedPriceUsd: number(input.expectedPriceUsd, 0),
  };
}

export function validateApplication(input = {}) {
  const fields = {};
  if (!text(input.projectName)) fields.projectName = 'Project name is required.';
  if (!text(input.contact) && !text(input.email) && !text(input.xHandle) && !text(input.telegram)) {
    fields.contact = 'Add at least one way to reach you.';
  }
  if (!text(input.endpoint) && !text(input.notes)) {
    fields.endpoint = 'Tell us what endpoint, tool, data feed, or workflow you want to monetize.';
  }
  return { ok: Object.keys(fields).length === 0, fields };
}

export async function createProviderApplication(input = {}, meta = {}) {
  const validation = validateApplication(input);
  if (!validation.ok) {
    const err = new Error('Invalid provider application');
    err.fields = validation.fields;
    throw err;
  }

  const ts = nowIso();
  const app = {
    id: id(),
    ...normalizeApplicationInput(input),
    status: 'new',
    priority: 'normal',
    adminNotes: '',
    source: meta.source || 'website_apply',
    ipHash: meta.ip ? crypto.createHash('sha256').update(String(meta.ip)).digest('hex') : null,
    userAgent: text(meta.userAgent, 300),
    createdAt: ts,
    updatedAt: ts,
  };
  return setApplication(app);
}

export async function listProviderApplications(filters = {}) {
  const limit = Math.min(Number(filters.limit) || 100, 500);
  const status = filters.status ? normalizeStatus(filters.status, '') : '';
  const apps = await scanApplications();
  return apps
    .filter(app => !status || app.status === status)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    .slice(0, limit);
}

export async function getProviderApplication(applicationId) {
  const apps = await scanApplications();
  return apps.find(app => app.id === applicationId) || null;
}

export async function updateProviderApplication(applicationId, patch = {}) {
  const current = await getProviderApplication(applicationId);
  if (!current) return null;
  const next = {
    ...current,
    updatedAt: nowIso(),
  };

  if (patch.status !== undefined) next.status = normalizeStatus(patch.status, current.status);
  if (patch.priority !== undefined) next.priority = normalizePriority(patch.priority, current.priority);
  if (patch.adminNotes !== undefined) next.adminNotes = text(patch.adminNotes, 2500);
  if (patch.expectedPriceUsd !== undefined) next.expectedPriceUsd = number(patch.expectedPriceUsd, current.expectedPriceUsd || 0);
  if (patch.monthlyVolumeEstimate !== undefined) next.monthlyVolumeEstimate = number(patch.monthlyVolumeEstimate, current.monthlyVolumeEstimate || 0);

  return setApplication(next);
}

export function getApplicationPipelineMetrics(applications = []) {
  const protocolFeeBps = Number(CONFIG.PROTOCOL_FEE_BPS || 0);
  const counts = {
    total: applications.length,
    new: 0,
    reviewing: 0,
    accepted: 0,
    rejected: 0,
    archived: 0,
  };

  let projectedMonthlyGrossVolumeUsd = 0;
  let weightedMonthlyGrossVolumeUsd = 0;

  const statusWeight = {
    new: 0.2,
    reviewing: 0.5,
    accepted: 1,
    rejected: 0,
    archived: 0,
  };

  for (const app of applications) {
    counts[app.status] = (counts[app.status] || 0) + 1;
    const gross = number(app.monthlyVolumeEstimate, 0) * number(app.expectedPriceUsd, 0);
    projectedMonthlyGrossVolumeUsd += gross;
    weightedMonthlyGrossVolumeUsd += gross * (statusWeight[app.status] ?? 0.2);
  }

  const projectedMonthlyProtocolRevenueUsd = projectedMonthlyGrossVolumeUsd * protocolFeeBps / 10_000;
  const weightedMonthlyProtocolRevenueUsd = weightedMonthlyGrossVolumeUsd * protocolFeeBps / 10_000;
  const estimatedMonthlyProviderRevenueUsd = projectedMonthlyGrossVolumeUsd - projectedMonthlyProtocolRevenueUsd;

  return {
    counts,
    protocolFeeBps,
    projectedMonthlyGrossVolumeUsd: Number(projectedMonthlyGrossVolumeUsd.toFixed(2)),
    estimatedMonthlyProviderRevenueUsd: Number(estimatedMonthlyProviderRevenueUsd.toFixed(2)),
    projectedMonthlyProtocolRevenueUsd: Number(projectedMonthlyProtocolRevenueUsd.toFixed(2)),
    weightedMonthlyGrossVolumeUsd: Number(weightedMonthlyGrossVolumeUsd.toFixed(2)),
    weightedMonthlyProtocolRevenueUsd: Number(weightedMonthlyProtocolRevenueUsd.toFixed(2)),
  };
}

export function applicationsToCsv(applications = []) {
  const cols = [
    'id', 'createdAt', 'updatedAt', 'status', 'priority', 'projectName', 'founderName', 'contact',
    'email', 'xHandle', 'telegram', 'website', 'category', 'endpoint', 'chargingModel', 'protocolSupport',
    'monthlyVolumeEstimate', 'expectedPriceUsd', 'audience', 'liveStatus', 'currentBilling', 'notes', 'adminNotes'
  ];
  const escape = (value) => {
    const textValue = String(value ?? '');
    return /[",\n]/.test(textValue) ? `"${textValue.replace(/"/g, '""')}"` : textValue;
  };
  return [
    cols.join(','),
    ...applications.map(app => cols.map(col => escape(app[col])).join(',')),
  ].join('\n');
}
