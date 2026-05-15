/**
 * Resource pack integration tests.
 * Run: node --test tests/resource-packs.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildResourcePackPolicy,
  createResourcePackBudget,
  getResourcePack,
  listResourcePacks,
} from '../lib/resource-packs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const projectRoot = resolve(root, '..');

function read(path) {
  return readFileSync(resolve(projectRoot, path), 'utf-8');
}

describe('Xona resource pack', () => {
  it('ships a public policy-ready Xona catalog', () => {
    const packs = listResourcePacks();
    const pack = getResourcePack('xona');

    assert.ok(packs.some(item => item.slug === 'xona'));
    assert.equal(pack.provider, 'Xona');
    assert.ok(pack.resources.length >= 10);
    assert.ok(pack.resources.some(resource => resource.id === 'xona-pumpfun-movers'));
    assert.ok(pack.resources.some(resource => resource.id === 'xona-token-signal'));
    assert.ok(pack.resources.every(resource => resource.endpoint.startsWith('/')));
    assert.deepEqual(pack.rails, ['x402', 'mpp']);
  });

  it('builds route allowlists from Xona presets', () => {
    const template = buildResourcePackPolicy('xona', {
      presetId: 'xona-market-agent',
      agentId: 'market-agent-1',
      dailyCapUsd: 12,
    });

    assert.equal(template.pack.slug, 'xona');
    assert.equal(template.preset.id, 'xona-market-agent');
    assert.equal(template.budget.agentId, 'market-agent-1');
    assert.equal(template.budget.dailyCapUsd, 12);
    assert.ok(template.budget.allowedRoutes.includes('/xona/token/pumpfun-movers'));
    assert.ok(template.budget.allowedRoutes.includes('/xona/token/signal'));
    assert.deepEqual(template.budget.allowedRails, ['x402', 'mpp']);
    assert.equal(template.budget.piiGuard, true);
  });

  it('creates an enforce-mode budget from a Xona preset', async () => {
    const result = await createResourcePackBudget('xona', {
      presetId: 'xona-research-agent',
      agentId: 'research-agent-1',
      mode: 'enforce',
    }, { apiKey: 'mf_test_xona_pack', wallet: 'wallet_xona_operator' });

    assert.equal(result.budget.agentId, 'research-agent-1');
    assert.equal(result.budget.mode, 'enforce');
    assert.ok(result.budget.allowedRoutes.includes('/xona/tokens-api/risk-summary'));
    assert.ok(result.budget.allowedRoutes.includes('/xona/token/solana-discovery'));
  });

  it('wires API routes, SDK helpers, docs, and registry copy', () => {
    const app = read('api-proxy/app.js');
    const routes = read('api-proxy/routes/resource-packs.js');
    const sdk = read('sdk/src/client.js');
    const docs = read('src/pages/Docs.tsx');
    const staticDocs = read('public/site/docs.html');
    const registry = read('api-proxy/lib/provider-registry.js');

    assert.ok(app.includes("import resourcePacksRouter from './routes/resource-packs.js'"));
    assert.ok(app.includes("app.use('/', resourcePacksRouter)"));
    assert.ok(app.indexOf("app.use('/', resourcePacksRouter)") < app.indexOf('x402Gateway'));
    assert.ok(routes.includes("router.get('/v1/resource-packs'"));
    assert.ok(routes.includes("router.post('/v1/resource-packs/:id/budgets'"));
    assert.ok(sdk.includes('createResourcePackBudget'));
    assert.ok(docs.includes('Xona Resource Pack'));
    assert.ok(staticDocs.includes('Xona Resource Pack'));
    assert.ok(registry.includes('prv_xona_agent_resources'));
  });
});
