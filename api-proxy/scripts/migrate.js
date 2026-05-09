import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePostgresPool, getPostgresPool, isPostgresEnabled } from '../lib/postgres.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const migrationsDir = resolve(root, 'db');

if (!isPostgresEnabled()) {
  console.error('DATABASE_URL or POSTGRES_URL is required to run migrations.');
  process.exit(1);
}

try {
  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query(`
    create table if not exists meterflow_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);

    const files = (await readdir(migrationsDir))
      .filter(file => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const id = file.replace(/\.sql$/, '');
      const existing = await client.query('select id from meterflow_migrations where id = $1', [id]);
      if (existing.rowCount) {
        console.log(`Skipping ${file}`);
        continue;
      }

      const sql = await readFile(resolve(migrationsDir, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into meterflow_migrations (id) values ($1)', [id]);
        await client.query('commit');
        console.log(`Applied ${file}`);
      } catch (err) {
        await client.query('rollback');
        throw err;
      }
    }
  } finally {
    client.release();
  }
} catch (err) {
  console.error(`Migration failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await closePostgresPool();
}
