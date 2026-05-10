/**
 * Provider application intake smoke tests.
 * Uses source assertions so the route, storage, and admin pages remain wired in deploys.
 * Run: node --test tests/provider-applications.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const projectRoot = resolve(root, '..');

function read(path) {
  return readFileSync(resolve(projectRoot, path), 'utf-8');
}

describe('Provider applications intake', () => {
  it('mounts the provider applications router before paid route auth', () => {
    const app = read('api-proxy/app.js');
    assert.ok(app.includes("import applicationsRouter from './routes/applications.js'"));
    assert.ok(app.includes("app.use('/', applicationsRouter)"));
    assert.ok(app.indexOf("app.use('/', applicationsRouter)") < app.indexOf('x402Gateway'));
  });

  it('exposes public intake and protected admin endpoints', () => {
    const routes = read('api-proxy/routes/applications.js');
    assert.ok(routes.includes("router.post('/applications/provider'"));
    assert.ok(routes.includes("router.get('/admin/applications'"));
    assert.ok(routes.includes("router.patch('/admin/applications/:id'"));
    assert.ok(routes.includes("router.get('/admin/applications/export.csv'"));
    assert.ok(routes.includes('authenticateAdmin'));
    assert.ok(routes.includes('rateLimit'));
  });

  it('stores applications persistently and computes revenue metrics', () => {
    const lib = read('api-proxy/lib/provider-applications.js');
    assert.ok(lib.includes('provider_application'));
    assert.ok(lib.includes('meterflow_control_records'));
    assert.ok(lib.includes('projectedMonthlyGrossVolumeUsd'));
    assert.ok(lib.includes('estimatedMonthlyProviderRevenueUsd'));
    assert.ok(lib.includes('projectedMonthlyProtocolRevenueUsd'));
    assert.ok(lib.includes('CONFIG.PROTOCOL_FEE_BPS'));
  });

  it('ships public and admin pages with the required API calls', () => {
    const apply = read('site/apply.html');
    const admin = read('site/admin-applications.html');
    const home = read('site/index.html');
    const docs = read('site/docs.html');
    const vercel = read('vercel.json');
    assert.ok(apply.includes('Launch a paid endpoint'));
    assert.ok(apply.includes('/proxy/applications/provider'));
    assert.ok(home.includes('href="/apply"'), 'homepage should expose provider application entrypoint');
    assert.ok(docs.includes('href="/apply"'), 'docs should expose provider application entrypoint');
    assert.ok(home.includes('https://github.com/nullxnothing'), 'homepage should expose GitHub entrypoint');
    assert.ok(admin.includes('Provider applications'));
    assert.ok(admin.includes('/proxy/admin/applications'));
    assert.ok(admin.includes('Meterflow profit'));
    assert.ok(vercel.includes('"/apply"'));
    assert.ok(vercel.includes('"/admin/applications"'));
  });
});
