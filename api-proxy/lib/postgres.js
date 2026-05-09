import pg from 'pg';
import { logger } from './logger.js';

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  '';

let pool = null;

function normalizeConnectionString(connectionString) {
  if (!connectionString) return '';

  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get('sslmode');
    if (['prefer', 'require', 'verify-ca'].includes(sslMode)) {
      url.searchParams.set('sslmode', 'verify-full');
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}

function isPostgresEnabled() {
  return Boolean(DATABASE_URL);
}

function getPostgresPool() {
  if (!isPostgresEnabled()) return null;
  if (pool) return pool;

  pool = new Pool({
    connectionString: normalizeConnectionString(DATABASE_URL),
    ssl: process.env.POSTGRES_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: Number(process.env.POSTGRES_POOL_MAX || 5),
    idleTimeoutMillis: Number(process.env.POSTGRES_IDLE_TIMEOUT_MS || 30_000),
    connectionTimeoutMillis: Number(process.env.POSTGRES_CONNECT_TIMEOUT_MS || 5_000),
  });

  pool.on('error', err => {
    logger.error('Postgres pool error', { err: err.message });
  });

  return pool;
}

async function query(text, params = []) {
  const db = getPostgresPool();
  if (!db) throw new Error('Postgres is not configured');
  return db.query(text, params);
}

async function checkPostgresHealth() {
  if (!isPostgresEnabled()) {
    return { configured: false, connected: false, migrated: false, status: 'not_configured' };
  }

  try {
    const result = await query(`
      select
        to_regclass('public.meterflow_control_records') is not null as control_records,
        to_regclass('public.meterflow_idempotency') is not null as idempotency
    `);
    const row = result.rows[0] || {};
    const migrated = Boolean(row.control_records && row.idempotency);
    return {
      configured: true,
      connected: true,
      migrated,
      status: migrated ? 'connected' : 'migration_required',
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      migrated: false,
      status: 'error',
      error: err.message,
    };
  }
}

async function closePostgresPool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}

export { checkPostgresHealth, closePostgresPool, getPostgresPool, isPostgresEnabled, query };
