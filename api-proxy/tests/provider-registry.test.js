/**
 * Provider trust registry tests.
 * Run: node --test tests/provider-registry.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getRegistryProvider,
  getRegistrySummary,
  listRegistryProviders,
  normalizeProvider,
  scoreProvider,
  trustTier,
  validateProvider,
} from '../lib/provider-registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const projectRoot = resolve(root, '..');

function read(path) {
  return readFileSync(resolve(projectRoot, path), 'utf-8');
}

describe('Provider trust registry', () => {
  it('normalizes providers and computes a useful trust score', () => {
    const provider = normalizeProvider({
      name: 'Example Risk API',
      category: 'risk',
      summary: 'Paid risk scoring endpoint.',
      endpoint: '/gateway/example/risk',
      protocolRails: ['x402', 'mpp', 'unknown'],
      verification: 'verified',
      status: 'live',
      bond: { required: 1000, committed: 1000, state: 'locked' },
      metrics: { successfulCalls: 1000, verifiedUsd: 25, uptimePct: 99.5, p95LatencyMs: 200, failureRatePct: 0.5 },
      policy: { supportsBudgets: true, supportsRefunds: true, piiGuard: true, agentAllowlisted: true },
    });

    assert.equal(provider.slug, 'example-risk-api');
    assert.deepEqual(provider.protocolRails, ['x402', 'mpp']);
    assert.ok(provider.trustScore >= 80, `expected strong score, got ${provider.trustScore}`);
    assert.equal(scoreProvider(provider), provider.trustScore);
    assert.equal(trustTier(provider.trustScore), provider.trustTier);
  });

  it('validates the public provider contract', () => {
    const validation = validateProvider({ name: 'Incomplete' });
    assert.equal(validation.ok, false);
    assert.ok(validation.fields.category);
    assert.ok(validation.fields.summary);
    assert.ok(validation.fields.endpoint);
    assert.ok(validation.fields.protocolRails);
  });

  it('ships seed registry data for public discovery', async () => {
    const [summary, providers, tokenRisk, xona] = await Promise.all([
      getRegistrySummary(),
      listRegistryProviders({ rail: 'x402', minScore: 1 }),
      getRegistryProvider('meterflow-token-risk'),
      getRegistryProvider('xona-agent-resources'),
    ]);

    assert.ok(summary.providers >= 4);
    assert.equal(summary.model.paymentAsset, 'USDC');
    assert.equal(summary.model.utilityAsset, 'MFLOW');
    assert.ok(summary.requiredMflow >= summary.committedMflow);
    assert.ok(providers.length >= 1);
    assert.equal(tokenRisk.slug, 'meterflow-token-risk');
    assert.equal(xona.slug, 'xona-agent-resources');
    assert.ok(xona.protocolRails.includes('x402'));
    assert.ok(xona.protocolRails.includes('mpp'));
    assert.equal(tokenRisk.adminNotes, undefined);
  });

  it('mounts public routes before payment middleware and protects admin mutations', () => {
    const app = read('api-proxy/app.js');
    const routes = read('api-proxy/routes/registry.js');
    assert.ok(app.includes("import registryRouter from './routes/registry.js'"));
    assert.ok(app.includes("app.use('/', registryRouter)"));
    assert.ok(app.indexOf("app.use('/', registryRouter)") < app.indexOf('x402Gateway'));
    assert.ok(routes.includes("router.get('/v1/registry/summary'"));
    assert.ok(routes.includes("router.get('/v1/registry/providers'"));
    assert.ok(routes.includes("router.post('/admin/registry/providers'"));
    assert.ok(routes.includes('authenticateAdmin'));
    assert.ok(routes.includes('rateLimit'));
  });

  it('wires the registry into the public site, SDK, and deployment rewrites', () => {
    const app = read('src/App.tsx');
    const productRoute = read('src/pages/ProductRoute.tsx');
    const registryPage = read('src/pages/Registry.tsx');
    const shell = read('src/components/site/Shell.tsx');
    const sdk = read('sdk/src/client.js');
    const vercel = read('vercel.json');
    const vercelFunction = read('api/proxy.js');
    const sitemap = read('public/sitemap.xml');

    assert.ok(app.includes('"/registry"'));
    assert.ok(productRoute.includes('RegistryPage'));
    assert.ok(registryPage.includes('/api/v1/registry/providers?limit=6'));
    assert.ok(registryPage.includes('USDC moves the money. MFLOW coordinates who agents can trust.'));
    assert.ok(shell.includes('{ href: "/registry", label: "Registry" }'));
    assert.ok(sdk.includes('registryProviders'));
    assert.ok(vercel.includes('"/registry"'));
    assert.ok(vercelFunction.includes("req.url.startsWith('/registry/')"));
    assert.ok(vercelFunction.includes("req.url.replace(/^\\/registry/, '/v1/registry')"));
    assert.ok(sitemap.includes('https://meterflow.fun/registry'));
  });
});
