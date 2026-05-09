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

function isPostgresEnabled() {
  return Boolean(DATABASE_URL);
}

function getPostgresPool() {
  if (!isPostgresEnabled()) return null;
  if (pool) return pool;

  pool = new Pool({
    connectionString: DATABASE_URL,
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

async function closePostgresPool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}

export { closePostgresPool, getPostgresPool, isPostgresEnabled, query };
