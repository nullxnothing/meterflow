import assert from 'node:assert/strict';

const baseUrl = (process.env.METERFLOW_SMOKE_BASE_URL || 'https://www.meterflow.fun').replace(/\/+$/, '');

function requireHeader(headers, name) {
  const value = headers.get(name);
  assert.ok(value, `missing ${name} header`);
  return value;
}

function decodeBase64Json(value) {
  let normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) normalized += '=';
  return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
}

async function checkPage(path, contains) {
  const res = await fetch(`${baseUrl}${path}`);
  assert.equal(res.status, 200, `${path} should return 200`);
  const text = await res.text();
  assert.ok(text.includes(contains), `${path} should include ${contains}`);
  return text;
}

async function checkJson(path) {
  const res = await fetch(`${baseUrl}${path}`);
  assert.equal(res.status, 200, `${path} should return 200`);
  return res.json();
}

const results = [];
function pass(name) {
  results.push(name);
  console.log(`ok - ${name}`);
}

await checkPage('/', 'Meterflow');
pass('home page');

const homeEntrypoints = await checkPage('/', '/apply');
assert.ok(homeEntrypoints.includes('https://github.com/nullxnothing/meterflow'), 'home page should link GitHub');
assert.ok(homeEntrypoints.includes('/dashboard'), 'home page should link dashboard');
assert.ok(homeEntrypoints.includes('/docs'), 'home page should link docs');
assert.ok(homeEntrypoints.includes('/privacy'), 'home page should link privacy policy');
assert.ok(homeEntrypoints.includes('/terms'), 'home page should link terms');
pass('public entrypoint links');

const dashboard = await checkPage('/dashboard', '<title>Meterflow</title>');
assert.ok(dashboard.includes('dashboard.css'), 'dashboard should load CSS');
assert.ok(dashboard.includes('init.js'), 'dashboard should load JS');
pass('dashboard assets');

const apply = await checkPage('/apply', 'Provider application');
assert.ok(apply.includes('/proxy/applications/provider'), 'apply page should submit to provider application API');
pass('provider apply page');

const docs = await checkPage('/docs', 'Meterflow');
assert.ok(docs.includes('/apply'), 'docs page should link provider application entrypoint');
pass('docs page');

await checkPage('/how-it-works', 'Meterflow');
pass('how-it-works page');

await checkPage('/roadmap', 'Meterflow');
pass('roadmap page');

await checkPage('/privacy', 'Privacy Policy');
pass('privacy page');

await checkPage('/terms', 'Terms of Service');
pass('terms page');

const manifest = await checkJson('/site.webmanifest');
assert.equal(manifest.name, 'Meterflow');
assert.equal(manifest.start_url, '/');
pass('web app manifest');

const health = await checkJson('/proxy/health');
assert.equal(health.status, 'ok');
assert.equal(health.storage?.redis?.configured, true);
assert.equal(health.storage?.postgres?.configured, true);
pass('proxy health');

const providers = await checkJson('/proxy/providers');
assert.ok(Object.values(providers).some(Boolean), 'at least one AI provider should be configured');
pass('providers');

const stats = await checkJson('/proxy/stats');
assert.ok(stats.totalCallsToday !== undefined, 'stats response should include daily call telemetry');
assert.ok(stats.activeProviders >= 1, 'stats response should include active providers');
pass('stats');

const cors = await fetch(`${baseUrl}/proxy/v1/chat`, {
  method: 'OPTIONS',
  headers: {
    Origin: baseUrl,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type,payment-signature,x-payment',
  },
});
assert.equal(cors.status, 204);
assert.ok(requireHeader(cors.headers, 'access-control-allow-headers').toLowerCase().includes('payment-signature'));
pass('x402 CORS preflight');

const quote = await fetch(`${baseUrl}/proxy/v1/chat`, {
  method: 'POST',
  headers: {
    Origin: baseUrl,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gemini-2.5-flash',
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 8,
  }),
});
assert.equal(quote.status, 402);
assert.ok(requireHeader(quote.headers, 'access-control-expose-headers').includes('Payment-Required'));
const paymentRequired = decodeBase64Json(requireHeader(quote.headers, 'payment-required'));
assert.equal(paymentRequired.x402Version, 2);
assert.equal(paymentRequired.resource?.url, `${baseUrl}/proxy/v1/chat`);
assert.equal(paymentRequired.accepts?.[0]?.payTo, '6ybgqYcvbKkhPCfRg76naKY2gjUUgyx4HHR3FqTa2GYR');
assert.equal(paymentRequired.accepts?.[0]?.asset, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
pass('x402 unpaid quote');

console.log(`\n${results.length} production smoke checks passed for ${baseUrl}`);
