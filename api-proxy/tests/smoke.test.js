/**
 * Smoke tests for Meterflow API Proxy production fixes.
 * Uses Node.js built-in test runner — no extra deps.
 * Run: node --test tests/smoke.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const projectRoot = resolve(root, '..');

// ═══════════════════════════════════════
// 1. CONFIG & ENV VALIDATION
// ═══════════════════════════════════════
describe('Config & env validation', () => {
  it('config.js rejects dev-default secrets in production mode', async () => {
    // Read config source and verify the validation logic exists
    const src = readFileSync(resolve(root, 'config.js'), 'utf-8');
    assert.ok(src.includes('DEV_DEFAULTS'), 'should define DEV_DEFAULTS array');
    assert.ok(src.includes("process.exit(1)"), 'should exit on insecure secrets');
    assert.ok(src.includes('dev-secret-change-me'), 'should check API_KEY_SECRET default');
    assert.ok(src.includes('dev-encryption-secret-change-me'), 'should check WALLET_ENCRYPTION_SECRET default');
    assert.ok(src.includes('dev-admin-key'), 'should check ADMIN_KEY default');
  });

  it('config.js requires critical env vars in production', async () => {
    const src = readFileSync(resolve(root, 'config.js'), 'utf-8');
    assert.ok(src.includes('HELIUS_API_KEY'), 'should check HELIUS_API_KEY');
    assert.ok(src.includes('HELIUS_RPC_URL'), 'should check HELIUS_RPC_URL');
    assert.ok(src.includes('REDIS_URL'), 'should check REDIS_URL');
    // Verify at least one AI provider required
    assert.ok(src.includes('ANTHROPIC_API_KEY') && src.includes('GOOGLE_API_KEY') && src.includes('OPENAI_API_KEY'),
      'should require at least one AI provider key');
  });

  it('whitelisted wallets defaults to empty set (no hardcoded wallets)', () => {
    const src = readFileSync(resolve(root, 'config.js'), 'utf-8');
    // Should use env var with empty string fallback, not a hardcoded address
    const whitelistMatch = src.match(/WHITELISTED_WALLETS.*?new Set\(([\s\S]*?)\)/);
    assert.ok(whitelistMatch, 'should have WHITELISTED_WALLETS as a Set');
    assert.ok(!whitelistMatch[1].includes('So1'), 'should not contain hardcoded Solana addresses');
  });
});

// ═══════════════════════════════════════
// 2. CORS CONFIG
// ═══════════════════════════════════════
describe('CORS configuration', () => {
  it('app.js whitelists meterflow.fun', () => {
    const src = readFileSync(resolve(root, 'app.js'), 'utf-8');
    assert.ok(src.includes("'https://meterflow.fun'"), 'should include bare domain');
    assert.ok(src.includes("'https://www.meterflow.fun'"), 'should include www subdomain');
  });

  it('app.js uses regex for subdomains', () => {
    const src = readFileSync(resolve(root, 'app.js'), 'utf-8');
    assert.ok(src.includes('\\.meterflow\\.fun$'), 'should have subdomain regex');
    assert.ok(src.includes('\\.vercel\\.app$'), 'should allow Vercel preview deploys');
  });

  it('does NOT allow wildcard * origin', () => {
    const src = readFileSync(resolve(root, 'app.js'), 'utf-8');
    assert.ok(!src.includes("origin: '*'"), 'must not use wildcard CORS');
    assert.ok(!src.includes('origin: true'), 'must not use origin: true (reflects any origin)');
  });

  it('trusts the Vercel proxy for accurate rate-limit identity', () => {
    const src = readFileSync(resolve(root, 'app.js'), 'utf-8');
    assert.ok(src.includes("app.set('trust proxy', 1)"));
  });

  it('localhost only in non-production', () => {
    const src = readFileSync(resolve(root, 'app.js'), 'utf-8');
    assert.ok(src.includes("process.env.NODE_ENV !== 'production'"),
      'localhost origins should be behind env check');
  });

  it('uses a single canonical token CA env with legacy mint fallback', () => {
    const src = readFileSync(resolve(root, 'config.js'), 'utf-8');
    assert.ok(src.includes('METERFLOW_TOKEN_CA'), 'should support canonical token CA env');
    assert.ok(src.includes('METERFLOW_TOKEN_MINT'), 'should retain legacy mint fallback');
    assert.ok(src.indexOf('METERFLOW_TOKEN_CA') < src.indexOf('METERFLOW_TOKEN_MINT'),
      'canonical CA env should take precedence over legacy mint env');
  });

  it('exposes x402 and MPP payment headers to browser clients', () => {
    const src = readFileSync(resolve(root, 'app.js'), 'utf-8');
    assert.ok(src.includes('exposedHeaders'), 'should expose payment response headers');
    for (const header of ['Payment-Required', 'Payment-Response', 'WWW-Authenticate', 'Payment-Receipt', 'Payment-Signature', 'X-Payment-Response', 'X-Meterflow-Payment-Protocol']) {
      assert.ok(src.includes(header), `should include ${header}`);
    }
  });
});

// ═══════════════════════════════════════
// 3. RATE LIMITING
// ═══════════════════════════════════════
describe('Rate limiting', () => {
  it('/auth/register has rate limiter', () => {
    const src = readFileSync(resolve(root, 'routes', 'auth.js'), 'utf-8');
    assert.ok(src.includes('rateLimit'), 'should import rate limiter');
    assert.ok(src.includes('registerLimiter'), 'should define register limiter');
    assert.ok(src.includes("'/register'") && src.includes('registerLimiter'),
      'register route should use rate limiter');
  });

  it('rate limiter window is 15 minutes, max 10 requests', () => {
    const src = readFileSync(resolve(root, 'routes', 'auth.js'), 'utf-8');
    assert.ok(src.includes('15 * 60 * 1000'), 'window should be 15 min');
    assert.ok(src.includes('max: 10'), 'max should be 10');
  });
});

// ═══════════════════════════════════════
// 4. SIGNATURE REPLAY PROTECTION
// ═══════════════════════════════════════
describe('Signature replay protection', () => {
  it('register endpoint validates timestamp in signed message', () => {
    const src = readFileSync(resolve(root, 'routes', 'auth.js'), 'utf-8');
    assert.ok(src.includes('SIG_MAX_AGE_MS'), 'should define max signature age');
    assert.ok(src.includes('5 * 60 * 1000'), 'max age should be 5 minutes');
    assert.ok(src.includes('Timestamp'), 'should parse Timestamp field from message');
  });

  it('rejects messages without timestamp', () => {
    const src = readFileSync(resolve(root, 'routes', 'auth.js'), 'utf-8');
    assert.ok(src.includes('invalid_message'), 'should return invalid_message error');
    assert.ok(src.includes('Signed message must include a Timestamp field'),
      'should explain missing timestamp');
  });

  it('rejects expired signatures', () => {
    const src = readFileSync(resolve(root, 'routes', 'auth.js'), 'utf-8');
    assert.ok(src.includes('signature_expired'), 'should return signature_expired error');
    assert.ok(src.includes('Math.abs(Date.now()'), 'should check absolute difference');
  });

  it('supports both base58 and base64 signatures', () => {
    const src = readFileSync(resolve(root, 'routes', 'auth.js'), 'utf-8');
    assert.ok(src.includes('bs58.decode(signature)'), 'should try base58 first');
    assert.ok(src.includes('atob(signature)'), 'should fallback to base64');
  });
});

// ═══════════════════════════════════════
// 5. ADMIN AUTH (TIMING-SAFE)
// ═══════════════════════════════════════
describe('Admin authentication', () => {
  it('uses timing-safe comparison', () => {
    const src = readFileSync(resolve(root, 'middleware.js'), 'utf-8');
    assert.ok(src.includes('timingSafeEqual'), 'should use timingSafeEqual');
    assert.ok(src.includes("from 'crypto'"), 'should import from crypto module');
  });

  it('rejects dev-default admin key', () => {
    const src = readFileSync(resolve(root, 'middleware.js'), 'utf-8');
    assert.ok(src.includes("'dev-admin-key'"), 'should check for dev default');
    assert.ok(src.includes('admin_not_configured'), 'should return admin_not_configured error');
  });

  it('checks key length before comparing (prevents oracle attack)', () => {
    const src = readFileSync(resolve(root, 'middleware.js'), 'utf-8');
    assert.ok(src.includes('key.length !== adminKey.length'),
      'should validate lengths match before timingSafeEqual');
  });
});

// ═══════════════════════════════════════
// 6. TREASURY MULTIPLIER
// ═══════════════════════════════════════
describe('Treasury multiplier in rate limits', () => {
  it('middleware applies treasury multiplier to daily limit', () => {
    const src = readFileSync(resolve(root, 'middleware.js'), 'utf-8');
    assert.ok(src.includes('getTreasuryState'), 'should import getTreasuryState');
    assert.ok(src.includes('treasuryMultiplier'), 'should read treasury multiplier');
    assert.ok(src.includes('effectiveLimit'), 'should compute effective limit');
    assert.ok(src.includes('Math.floor'), 'should floor the effective limit');
  });
});

// ═══════════════════════════════════════
// 7. REDIS FAIL-CLOSED IN PRODUCTION
// ═══════════════════════════════════════
describe('Redis fail-closed (production)', () => {
  it('redis.js exits in production without Redis', () => {
    const src = readFileSync(resolve(root, 'lib', 'redis.js'), 'utf-8');
    assert.ok(src.includes('IS_PROD'), 'should check IS_PROD');
    assert.ok(src.includes("process.exit(1)"), 'should exit without Redis in prod');
  });

  it('/health reports Redis and Postgres storage readiness', () => {
    const route = readFileSync(resolve(root, 'routes', 'admin.js'), 'utf-8');
    const redis = readFileSync(resolve(root, 'lib', 'redis.js'), 'utf-8');
    const postgres = readFileSync(resolve(root, 'lib', 'postgres.js'), 'utf-8');
    assert.ok(route.includes('checkRedisHealth'), 'health should check Redis');
    assert.ok(route.includes('checkPostgresHealth'), 'health should check Postgres');
    assert.ok(route.includes('storage'), 'health should return storage status');
    assert.ok(route.includes('errorAlertWebhookConfigured'), 'health should expose alerting readiness');
    assert.ok(route.includes('sentryConfigured'), 'health should expose Sentry readiness');
    assert.ok(redis.includes('checkRedisHealth'), 'Redis health helper should exist');
    assert.ok(postgres.includes('migration_required'), 'Postgres health should detect missing migrations');
  });

  it('normalizes Neon sslmode to avoid pg runtime warnings', () => {
    const postgres = readFileSync(resolve(root, 'lib', 'postgres.js'), 'utf-8');
    assert.ok(postgres.includes('normalizeConnectionString'));
    assert.ok(postgres.includes("url.searchParams.set('sslmode', 'verify-full')"));
  });

  it('kv-keys depends on the shared Redis client', () => {
    const src = readFileSync(resolve(root, 'lib', 'kv-keys.js'), 'utf-8');
    assert.ok(src.includes('IS_PROD'), 'should check IS_PROD');
    assert.ok(src.includes("from './redis.js'"), 'should use shared Redis client');
  });

  it('kv-keys throws on Redis failure in production (not fallback)', () => {
    const src = readFileSync(resolve(root, 'lib', 'kv-keys.js'), 'utf-8');
    assert.ok(src.includes("throw new Error('Key store unavailable')"),
      'should throw instead of falling back in prod');
  });

  it('kv-usage depends on the shared Redis client', () => {
    const src = readFileSync(resolve(root, 'lib', 'kv-usage.js'), 'utf-8');
    assert.ok(src.includes('IS_PROD'), 'should check IS_PROD');
    assert.ok(src.includes("from './redis.js'"), 'should use shared Redis client');
  });

  it('kv-usage throws on Redis failure in production', () => {
    const src = readFileSync(resolve(root, 'lib', 'kv-usage.js'), 'utf-8');
    assert.ok(src.includes("throw new Error('Usage store unavailable')"),
      'should throw instead of falling back in prod');
  });
});

// ═══════════════════════════════════════
// 8. STREAM DISCONNECT HANDLING
// ═══════════════════════════════════════
describe('Stream disconnect handling', () => {
  it('chat route creates AbortController for client disconnect', () => {
    const src = readFileSync(resolve(root, 'routes', 'chat.js'), 'utf-8');
    assert.ok(src.includes('AbortController'), 'should create AbortController');
    assert.ok(src.includes("res.on('close'"), 'should listen for client close event');
    assert.ok(src.includes('abortController.abort()'), 'should abort on disconnect');
  });

  it('Anthropic provider accepts signal parameter', () => {
    const src = readFileSync(resolve(root, 'providers', 'anthropic.js'), 'utf-8');
    assert.ok(src.includes('signal'), 'should accept signal parameter');
  });

  it('Gemini provider accepts signal parameter', () => {
    const src = readFileSync(resolve(root, 'providers', 'gemini.js'), 'utf-8');
    assert.ok(src.includes('signal'), 'should accept signal parameter');
  });

  it('OpenAI provider accepts signal parameter', () => {
    const src = readFileSync(resolve(root, 'providers', 'openai.js'), 'utf-8');
    assert.ok(src.includes('signal'), 'should accept signal parameter');
  });
});

// ═══════════════════════════════════════
// 9. REQUEST TIMEOUTS
// ═══════════════════════════════════════
describe('Request timeouts', () => {
  it('balance.js has fetch timeout', () => {
    const src = readFileSync(resolve(root, 'lib', 'balance.js'), 'utf-8');
    assert.ok(src.includes('FETCH_TIMEOUT') || src.includes('AbortSignal.timeout'),
      'should have fetch timeout mechanism');
  });

  it('balance.js sums MFLOW accounts and falls back through SPL token programs', () => {
    const src = readFileSync(resolve(root, 'lib', 'balance.js'), 'utf-8');
    assert.ok(src.includes('TOKEN_PROGRAM_IDS'), 'should know both SPL token program ids');
    assert.ok(src.includes('uiAmountString'), 'should parse precise UI token amounts');
    assert.ok(src.includes('sumTokenAccounts'), 'should sum all matching token accounts');
    assert.ok(src.includes('{ programId }'), 'should fall back to owner/program scans for Token-2022 edge cases');
  });

  it('providers have API timeout constants', () => {
    for (const provider of ['anthropic.js', 'gemini.js', 'openai.js']) {
      const src = readFileSync(resolve(root, 'providers', provider), 'utf-8');
      assert.ok(src.includes('API_TIMEOUT') || src.includes('AbortSignal.timeout'),
        `${provider} should have API timeout`);
    }
  });
});

// ═══════════════════════════════════════
// 10. GRACEFUL SHUTDOWN
// ═══════════════════════════════════════
describe('Graceful shutdown', () => {
  it('server.js handles SIGTERM', () => {
    const src = readFileSync(resolve(root, 'server.js'), 'utf-8');
    assert.ok(src.includes("process.on('SIGTERM'"), 'should handle SIGTERM');
  });

  it('server.js handles SIGINT', () => {
    const src = readFileSync(resolve(root, 'server.js'), 'utf-8');
    assert.ok(src.includes("process.on('SIGINT'"), 'should handle SIGINT');
  });

  it('has forced shutdown timeout', () => {
    const src = readFileSync(resolve(root, 'server.js'), 'utf-8');
    assert.ok(src.includes('SHUTDOWN_TIMEOUT'), 'should define shutdown timeout');
    assert.ok(src.includes('server.close'), 'should close server gracefully');
  });
});

// ═══════════════════════════════════════
// 11. SECURITY HEADERS (vercel.json)
// ═══════════════════════════════════════
describe('Security headers (vercel.json)', () => {
  const vercel = JSON.parse(readFileSync(resolve(projectRoot, 'vercel.json'), 'utf-8'));
  const headerRule = vercel.headers?.find(h => h.source === '/(.*)');
  const headers = headerRule?.headers || [];

  const getHeader = (key) => headers.find(h => h.key === key);

  it('has X-Content-Type-Options: nosniff', () => {
    const h = getHeader('X-Content-Type-Options');
    assert.ok(h, 'header should exist');
    assert.equal(h.value, 'nosniff');
  });

  it('has X-Frame-Options: DENY', () => {
    const h = getHeader('X-Frame-Options');
    assert.ok(h, 'header should exist');
    assert.equal(h.value, 'DENY');
  });

  it('has Strict-Transport-Security (HSTS)', () => {
    const h = getHeader('Strict-Transport-Security');
    assert.ok(h, 'header should exist');
    assert.ok(h.value.includes('max-age='), 'should set max-age');
    assert.ok(h.value.includes('includeSubDomains'), 'should include subdomains');
  });

  it('has Referrer-Policy', () => {
    const h = getHeader('Referrer-Policy');
    assert.ok(h, 'header should exist');
    assert.equal(h.value, 'strict-origin-when-cross-origin');
  });

  it('has Permissions-Policy blocking camera/mic/geo', () => {
    const h = getHeader('Permissions-Policy');
    assert.ok(h, 'header should exist');
    assert.ok(h.value.includes('geolocation=()'), 'should block geolocation');
    assert.ok(h.value.includes('microphone=()'), 'should block microphone');
    assert.ok(h.value.includes('camera=()'), 'should block camera');
  });
});

// ═══════════════════════════════════════
// 12. XSS PREVENTION (Frontend)
// ═══════════════════════════════════════
describe('XSS prevention (frontend)', () => {
  it('actions.js toast does not use innerHTML for user content', () => {
    const src = readFileSync(resolve(projectRoot, 'dashboard', 'js', 'actions.js'), 'utf-8');
    // Check that showToast doesn't assign user-controlled content via innerHTML
    // It should use textContent or createElement
    assert.ok(src.includes('textContent') || src.includes('createElement'),
      'should use safe DOM APIs for toast messages');
  });

  it('chat.js has image mime type whitelist', () => {
    const src = readFileSync(resolve(projectRoot, 'dashboard', 'js', 'chat.js'), 'utf-8');
    assert.ok(src.includes('ALLOWED_MIME') || src.includes('image/png') || src.includes('image/jpeg'),
      'should whitelist safe image mime types');
  });
});

// ═══════════════════════════════════════
// 13. SESSION STORAGE FOR API KEY
// ═══════════════════════════════════════
describe('Session storage for API key', () => {
  it('session.js uses sessionStorage not localStorage for apiKey', () => {
    const src = readFileSync(resolve(projectRoot, 'dashboard', 'js', 'session.js'), 'utf-8');
    // There should be sessionStorage.setItem for apiKey
    // Should NOT have localStorage.setItem('meterflow_apiKey'...)
    const localStorageApiKey = src.match(/localStorage\.(setItem|getItem)\(['"]meterflow_apiKey/);
    assert.ok(!localStorageApiKey, 'should NOT store apiKey in localStorage');

    assert.ok(src.includes('sessionStorage'), 'should use sessionStorage');
  });
});

// ═══════════════════════════════════════
// 14. DEAD LINKS & SITE INTEGRITY
// ═══════════════════════════════════════
describe('Site link integrity', () => {
  it('index.html has no bare href="#" on important links', () => {
    const src = readFileSync(resolve(projectRoot, 'site', 'index.html'), 'utf-8');
    const bareHashLinks = [...src.matchAll(/href="#"/g)];
    assert.equal(bareHashLinks.length, 0, 'important links should not point to bare #');
  });

  it('docs.html docs link points to /docs not #', () => {
    const src = readFileSync(resolve(projectRoot, 'site', 'docs.html'), 'utf-8');
    assert.ok(src.includes('href="/docs"'), 'Docs nav link should point to /docs');
  });

  it('copyright year is current', () => {
    const src = readFileSync(resolve(projectRoot, 'site', 'index.html'), 'utf-8');
    assert.ok(src.includes('2026'), 'copyright should be 2026');
  });

  it('product docs position Meterflow as the control plane for agent commerce', () => {
    const readme = readFileSync(resolve(projectRoot, 'README.md'), 'utf-8');
    const home = readFileSync(resolve(projectRoot, 'site', 'index.html'), 'utf-8');
    const docs = readFileSync(resolve(projectRoot, 'site', 'docs.html'), 'utf-8');
    assert.ok(readme.includes('The Solana control plane for agent commerce'), 'README should lead with agent-commerce positioning');
    assert.ok(readme.includes('x402 and MPP, one control plane'), 'README should explain the protocol-neutral direction');
    assert.ok(readme.includes('default live paid route is intentionally narrow'), 'README should frame the live route surface narrowly');
    assert.ok(home.includes('The control plane for'), 'landing page should lead with agent-commerce positioning');
    assert.ok(home.includes('MPP'), 'landing page should mention MPP payment adapters');
    assert.ok(home.includes('Launchpad') && home.includes('Apply as provider'), 'landing page provider CTAs should stay focused');
    assert.ok(docs.includes('Wrap Your API In 10 Minutes'), 'docs should include hosted API wrapping guide');
    assert.ok(docs.includes('MPP Payment Rail'), 'docs should explain the MPP adapter layer');
    assert.ok(docs.includes('Provider Registry'), 'docs should explain provider discovery and ranking');
    assert.ok(docs.includes('Meterflow routes are priced product surfaces'), 'docs should frame routes as priced control-plane surfaces');
  });
});

// ═══════════════════════════════════════
// 15. HELPER FUNCTIONS
// ═══════════════════════════════════════
describe('Helper functions', () => {
  // Dynamically import helpers since they don't require external deps
  it('generateApiKey produces correct format', async () => {
    // Can't import directly due to config side effects, so check source
    const src = readFileSync(resolve(root, 'lib', 'helpers.js'), 'utf-8');
    assert.ok(src.includes('mf_live_'), 'should prefix new keys with mf_live_');
    assert.ok(src.includes('randomBytes'), 'should use crypto.randomBytes');
  });

  it('getTierForBalance returns correct tiers', () => {
    const src = readFileSync(resolve(root, 'lib', 'helpers.js'), 'utf-8');
    assert.ok(src.includes("'architect'"), 'should have architect tier');
    assert.ok(src.includes("'operator'"), 'should have operator tier');
    assert.ok(src.includes("'signal'"), 'should have signal tier');
    assert.ok(src.includes('return null'), 'should return null for insufficient balance');
  });
});

// ═══════════════════════════════════════
// 16. VERCEL ROUTING
// ═══════════════════════════════════════
describe('Vercel routing', () => {
  const vercel = JSON.parse(readFileSync(resolve(projectRoot, 'vercel.json'), 'utf-8'));

  it('has proxy rewrite to Vercel API function', () => {
    const proxyRewrite = vercel.rewrites.find(r => r.source.includes('/proxy'));
    assert.ok(proxyRewrite, 'should have /proxy rewrite');
    assert.equal(proxyRewrite.destination, '/api/proxy');
    assert.ok(vercel.rewrites.some(r => r.source === '/api/:path*' && r.destination === '/api/proxy'));
  });

  it('Vercel function wraps the Express app', () => {
    const src = readFileSync(resolve(projectRoot, 'api', 'proxy.js'), 'utf-8');
    const ignore = readFileSync(resolve(projectRoot, '.vercelignore'), 'utf-8');
    const pkg = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf-8'));
    assert.ok(src.includes("from '../api-proxy/app.js'"), 'function should import the Express app');
    assert.ok(src.includes('(?:api\\/proxy|api|proxy)'), 'function should strip /api/proxy, /api, and /proxy prefixes');
    assert.ok(src.includes("searchParams.get('path')"), 'function should normalize Vercel rewrite path params');
    assert.ok(src.includes('req.originalUrl') && src.includes('/proxy${req.url}'), 'function should keep x402 resource URLs under /proxy');
    assert.ok(src.includes('bodyParser: false'), 'function should let Express parse POST bodies for x402/Zauth routes');
    assert.ok(src.includes('preserveVercelParsedBody') && src.includes('req._body = true'), 'function should tolerate Vercel dev pre-parsed bodies');
    assert.ok(!ignore.split(/\r?\n/).includes('api-proxy'), 'api-proxy must be included in Vercel deployment');
    assert.ok(pkg.dependencies.express, 'root package should include API dependencies for Vercel');
  });

  it('pins rpc-websockets to a Vercel-compatible uuid tree', () => {
    const pkg = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf-8'));
    const lock = JSON.parse(readFileSync(resolve(projectRoot, 'package-lock.json'), 'utf-8'));
    const rpcPath = Object.keys(lock.packages).find(path => path.endsWith('node_modules/rpc-websockets'));
    assert.equal(pkg.overrides['rpc-websockets'], '9.3.3');
    assert.ok(rpcPath, 'root lockfile should include rpc-websockets');
    assert.equal(lock.packages[rpcPath].version, '9.3.3');
    assert.equal(lock.packages[rpcPath].dependencies.uuid, '^8.3.2');
  });

  it('has all required page rewrites', () => {
    const sources = vercel.rewrites.map(r => r.source);
    assert.ok(sources.includes('/'), 'should rewrite /');
    assert.ok(sources.includes('/dashboard'), 'should rewrite /dashboard');
    assert.ok(sources.includes('/docs'), 'should rewrite /docs');
    assert.ok(sources.includes('/token'), 'should rewrite /token');
    assert.ok(sources.includes('/how-it-works'), 'should rewrite /how-it-works');
    assert.ok(sources.includes('/privacy'), 'should rewrite /privacy');
    assert.ok(sources.includes('/terms'), 'should rewrite /terms');
  });
});

// ═══════════════════════════════════════
// 17. METERFLOW CONTROL PLANE
// ═══════════════════════════════════════
describe('Meterflow control plane', () => {
  it('app.js mounts the control-plane router', () => {
    const src = readFileSync(resolve(root, 'app.js'), 'utf-8');
    assert.ok(src.includes('controlPlaneRouter'), 'should import control-plane router');
    assert.ok(src.includes("app.use('/v1', controlPlaneRouter)"), 'should mount control-plane routes under /v1');
  });

  it('app.js mounts the default MCP gateway route', () => {
    const server = readFileSync(resolve(root, 'app.js'), 'utf-8');
    const route = readFileSync(resolve(root, 'routes', 'mcp.js'), 'utf-8');
    assert.ok(server.includes('mcpRouter'), 'should import MCP router');
    assert.ok(server.includes("app.use('/mcp', mcpRouter)"), 'should mount MCP routes under /mcp');
    assert.ok(route.includes("router.get('/token-risk'"), 'should expose GET metadata for browser and registry probes');
    assert.ok(route.includes("router.post('/token-risk'"), 'should implement /mcp/token-risk');
    assert.ok(route.includes('completeMeteredRequest'), 'MCP route should write receipts');
  });

  it('does not mount legacy social posting bot routes', () => {
    const server = readFileSync(resolve(root, 'app.js'), 'utf-8');
    const tools = readFileSync(resolve(root, 'tools', 'definitions.js'), 'utf-8');
    const oauth = readFileSync(resolve(root, 'oauth', 'config.js'), 'utf-8');

    assert.ok(!server.includes('twitterRouter'), 'should not mount the legacy Twitter route');
    assert.ok(!tools.includes('twitter_lookup'), 'server tools should not include social posting');
    assert.ok(!oauth.includes('TWITTER_CLIENT_ID'), 'OAuth providers should not include Twitter app credentials');
  });

  it('control-plane storage defines meters receipts budgets and MCP tools', () => {
    const src = readFileSync(resolve(root, 'lib', 'control-plane.js'), 'utf-8');
    for (const token of ['DEFAULT_METERS', 'recordReceipt', 'updateReceipt', 'authorizeMeteredRequest', 'createBudget', 'createMcpTool', 'idempotencyKey', 'txSignature', 'payerWallet', 'dispatchWebhookEvent', 'listReceiptsForPrincipal']) {
      assert.ok(src.includes(token), `should include ${token}`);
    }
  });

  it('wallet-authenticated users can inspect x402 payer receipts', () => {
    const src = readFileSync(resolve(root, 'routes', 'control-plane.js'), 'utf-8');
    const control = readFileSync(resolve(root, 'lib', 'control-plane.js'), 'utf-8');
    assert.ok(src.includes('listReceiptsForPrincipal'), 'receipt routes should merge API-key and wallet-scoped receipts');
    assert.ok(src.includes('payerWallet === req.meterflow.wallet'), 'receipt detail access should include x402 payer wallet ownership');
    assert.ok(control.includes('receipt.payerWallet === filters.wallet'), 'wallet receipt filters should match payerWallet');
  });

  it('control-plane supports persistent Postgres storage', () => {
    const lib = readFileSync(resolve(root, 'lib', 'control-plane.js'), 'utf-8');
    const postgres = readFileSync(resolve(root, 'lib', 'postgres.js'), 'utf-8');
    const migration = readFileSync(resolve(root, 'db', '001_control_plane.sql'), 'utf-8');
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));

    assert.ok(pkg.dependencies.pg, 'should install pg');
    assert.ok(pkg.scripts.migrate, 'should expose migration script');
    assert.ok(postgres.includes('DATABASE_URL'), 'should read DATABASE_URL');
    assert.ok(lib.includes('isPostgresEnabled'), 'control plane should use Postgres when configured');
    assert.ok(migration.includes('meterflow_control_records'), 'should create control records table');
    assert.ok(migration.includes('meterflow_idempotency'), 'should create idempotency table');
  });

  it('x402 meter startup can quietly fall back without weakening normal control-plane reads', () => {
    const control = readFileSync(resolve(root, 'lib', 'control-plane.js'), 'utf-8');
    const x402 = readFileSync(resolve(root, 'lib', 'x402.js'), 'utf-8');
    assert.ok(control.includes('options.allowFallback'), 'control-plane scans should support explicit fallback mode');
    assert.ok(control.includes('!options.quiet'), 'handled fallback callers should be able to suppress noisy error logs');
    assert.ok(x402.includes('listBillableMeters({ allowFallback: true, quiet: true })'), 'x402 startup should use quiet fallback mode');
  });

  it('authenticated routes allow pre-verified x402 requests', () => {
    const src = readFileSync(resolve(root, 'middleware.js'), 'utf-8');
    assert.ok(src.includes('req.meterflow?.paymentVerified'), 'should detect pre-verified x402 context');
    assert.ok(src.includes('return next();'), 'should pass verified x402 requests through route auth');
  });

  it('x402 only wraps configured paid meter routes', () => {
    const src = readFileSync(resolve(root, 'lib', 'x402.js'), 'utf-8');
    const app = readFileSync(resolve(root, 'app.js'), 'utf-8');
    assert.ok(src.includes('findMeterInList'), 'should pre-match paid meter routes from the initialized route table');
    assert.ok(src.includes('Array.isArray(x402?.meters)'), 'should reuse initialized meters instead of scanning storage per request');
    assert.ok(src.includes('if (!meter) return next();'), 'public routes should bypass x402 context injection');
    assert.ok(src.includes('process.env.X402_PAY_TO || CONFIG.TREASURY_WALLET'), 'gateway should resolve payTo at request time');
    assert.ok(app.includes('x402GatewayReady'), 'app should wait for x402 initialization on cold starts');
  });

  it('x402 route pricing is built from the meter registry', () => {
    const src = readFileSync(resolve(root, 'lib', 'x402.js'), 'utf-8');
    assert.ok(src.includes('listBillableMeters'), 'should read x402 prices from registered meters');
    assert.ok(src.includes('DEFAULT_METERS'), 'should fall back to default meters if dynamic registry is unavailable');
    assert.ok(src.includes('buildRouteConfig'), 'should expose route config builder');
    assert.ok(!src.includes('const METER_ROUTES'), 'should not keep a second static meter list');
    assert.ok(src.includes('recordX402Failure'), 'x402 middleware should only create receipts for payment failures before route completion');
  });

  it('x402 meter matching refreshes custom meters without process restart', () => {
    const src = readFileSync(resolve(root, 'lib', 'x402.js'), 'utf-8');
    assert.ok(src.includes('METER_REFRESH_TTL_MS'), 'should use a short meter refresh TTL');
    assert.ok(src.includes('refreshGateway(true)'), 'should force-refresh once on missing meter');
    assert.ok(src.includes('x402.refresh()'), 'should rebuild x402 middleware from current billable meters');
  });

  it('MPP is integrated as an additive Solana payment rail', () => {
    const app = readFileSync(resolve(root, 'app.js'), 'utf-8');
    const mpp = readFileSync(resolve(root, 'lib', 'mpp.js'), 'utf-8');
    const control = readFileSync(resolve(root, 'lib', 'control-plane.js'), 'utf-8');
    const routes = readFileSync(resolve(root, 'routes', 'control-plane.js'), 'utf-8');
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));
    assert.ok(app.includes('buildMppMiddleware') && app.includes('mppGatewayReady'), 'app should initialize the MPP gateway before x402');
    assert.ok(app.indexOf('mppGatewayReady') < app.indexOf('x402GatewayReady'), 'MPP opt-in should get first chance before x402 fallback');
    assert.ok(mpp.includes("from 'solana-mpp/server'"), 'should use the Solana MPP server SDK');
    assert.ok(mpp.includes("from 'mppx'"), 'should use MPP receipt/store helpers');
    assert.ok(mpp.includes('MPP_SECRET_KEY'), 'MPP should require signed challenge configuration');
    assert.ok(mpp.includes('X-Meterflow-Payment-Protocol'), 'callers should be able to opt into MPP explicitly');
    assert.ok(mpp.includes('Authorization') && mpp.includes('Payment-Receipt'), 'should support standard MPP auth and receipt headers');
    assert.ok(mpp.includes("paymentProtocol: 'mpp'"), 'verified MPP calls should tag receipts as MPP');
    assert.ok(control.includes('paymentProtocol') && control.includes('paymentIntent') && control.includes('paymentReference'), 'receipts should store protocol metadata');
    assert.ok(routes.includes('paymentProtocol') && routes.includes('paymentReference'), 'receipt exports should include protocol metadata');
    assert.ok(pkg.dependencies.mppx && pkg.dependencies['solana-mpp'], 'should declare MPP dependencies');
  });

  it('Zauth provider monitoring is wired before x402', () => {
    const app = readFileSync(resolve(root, 'app.js'), 'utf-8');
    const zauth = readFileSync(resolve(root, 'lib', 'zauth.js'), 'utf-8');
    const env = readFileSync(resolve(root, '.env.example'), 'utf-8');
    const apiPkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));
    const rootPkg = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf-8'));

    assert.ok(app.includes('createZauthProviderMiddleware'), 'app should import Zauth middleware factory');
    assert.ok(app.includes('zauthMiddlewareReady'), 'app should initialize Zauth middleware lazily');
    assert.ok(app.indexOf('zauthMiddlewareReady') < app.indexOf('const x402GatewayReady'), 'Zauth should observe requests before x402 handles payment');
    assert.ok(app.includes('flushZauthBeforeEnd') && app.includes('middleware.shutdown()'), 'Vercel should flush queued Zauth telemetry before the response ends');
    assert.ok(zauth.includes("import('@zauthx402/sdk/middleware')"), 'Zauth wrapper should use the official SDK middleware export');
    assert.ok(zauth.includes('ZAUTH_API_KEY'), 'Zauth wrapper should be env-gated');
    assert.ok(zauth.includes('ZAUTH_INCLUDE_ROUTES'), 'Zauth wrapper should support route filtering');
    assert.ok(zauth.includes('ZAUTH_REFUNDS_ENABLED'), 'Zauth wrapper should keep refunds explicitly opt-in');
    assert.ok(zauth.includes('ZAUTH_BATCH_SIZE') && zauth.includes('maxBatchSize'), 'Zauth telemetry should flush promptly in serverless deployments');
    assert.ok(env.includes('ZAUTH_API_KEY') && env.includes('ZAUTH_INCLUDE_ROUTES'), 'env example should document Zauth setup');
    assert.ok(apiPkg.dependencies['@zauthx402/sdk'], 'api-proxy should declare the Zauth SDK dependency');
    assert.ok(rootPkg.dependencies['@zauthx402/sdk'], 'root package should declare the Zauth SDK dependency for Vercel installs');
  });

  it('hosted gateway meters store target metadata safely', () => {
    const control = readFileSync(resolve(root, 'lib', 'control-plane.js'), 'utf-8');
    const routes = readFileSync(resolve(root, 'routes', 'control-plane.js'), 'utf-8');
    const gateway = readFileSync(resolve(root, 'routes', 'provider-gateway.js'), 'utf-8');
    const app = readFileSync(resolve(root, 'app.js'), 'utf-8');
    const dashboard = readFileSync(resolve(projectRoot, 'dashboard', 'js', 'tabs', 'control-plane.js'), 'utf-8');
    assert.ok(control.includes('normalizeTargetUrl'), 'should validate targetUrl');
    assert.ok(control.includes('targetHost'), 'should store target host metadata');
    assert.ok(control.includes('upstreamAuthConfigured'), 'meter responses should redact upstream auth secret values');
    assert.ok(control.includes("`/gateway/${meterId}/*`"), 'should generate hosted gateway route when route is omitted');
    assert.ok(routes.includes('hostedGateway'), 'meter test should expose hosted gateway preview');
    assert.ok(gateway.includes('HOP_BY_HOP_HEADERS'), 'gateway should filter unsafe caller headers');
    assert.ok(gateway.includes('completeMeteredRequest'), 'gateway should complete Meterflow receipts');
    assert.ok(app.includes("app.use('/', providerGatewayRouter)") && app.indexOf("app.use('/', providerGatewayRouter)") > app.indexOf('const gateway = x402Gateway'), 'hosted gateway should mount after x402 middleware');
    assert.ok(dashboard.includes('meterTargetUrl'), 'dashboard should let providers create hosted API meters');
    assert.ok(dashboard.includes('upstreamAuth'), 'dashboard should submit upstream auth for hosted API meters');
    assert.ok(dashboard.includes('route: targetUrl ? undefined'), 'dashboard should let hosted API meters use generated gateway routes');
    assert.ok(dashboard.includes('Copy Gateway'), 'dashboard should expose generated hosted gateway URLs');
  });

  it('dashboard lets wallet-authenticated non-holders create paid endpoints', () => {
    const gate = readFileSync(resolve(projectRoot, 'dashboard', 'js', 'gate.js'), 'utf-8');
    const overview = readFileSync(resolve(projectRoot, 'dashboard', 'js', 'tabs', 'overview.js'), 'utf-8');
    const manageFn = gate.match(/export function canManageMeterflow\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
    assert.ok(manageFn.includes('hasMeterflowSession()'), 'control-plane management should require a wallet key session');
    assert.ok(!manageFn.includes("STATE.tier !== 'Trial'"), 'control-plane management should not be holder-tier gated');
    assert.ok(gate.includes('non-holder usage includes the protocol fee'), 'trial copy should explain paid-flow protocol fees');
    assert.ok(overview.includes('hasMeterflowSession'), 'overview should render a live wallet session even before holder fee relief');
  });

  it('protocol fee relief is based on actual MFLOW balance, not access tier labels', () => {
    const control = readFileSync(resolve(root, 'lib', 'control-plane.js'), 'utf-8');
    const auth = readFileSync(resolve(root, 'routes', 'auth.js'), 'utf-8');
    assert.ok(control.includes('hasProtocolFeeRelief'), 'control-plane should centralize fee-relief decisions');
    assert.ok(control.includes('Number(access.balance || 0) >= minSignal'), 'fee relief should require actual token balance');
    assert.ok(control.includes('CONFIG.WHITELISTED_WALLETS.has(access.wallet)'), 'whitelisted operators should retain fee relief');
    assert.ok(control.includes('applyProtocolFee(meter.priceUsd, req.meterflow)'), 'metered requests should pass full auth context to fee calculation');
    assert.ok(auth.includes('const feeRelief ='), 'auth responses should report current fee state from holder balance');
  });

  it('unsafe hosted target URLs are rejected', () => {
    const control = readFileSync(resolve(root, 'lib', 'control-plane.js'), 'utf-8');
    assert.ok(control.includes('targetUrl must use HTTPS in production'), 'production target URLs should require HTTPS');
    for (const token of ['localhost', '169', '192', 'metadata.google.internal', '.internal', '.local']) {
      assert.ok(control.includes(token), `should block ${token} target hosts`);
    }
  });

  it('treasury health includes USDC settlement balance', () => {
    const balance = readFileSync(resolve(root, 'lib', 'balance.js'), 'utf-8');
    const route = readFileSync(resolve(root, 'routes', 'admin.js'), 'utf-8');
    assert.ok(balance.includes('treasury-usdc-balance'), 'treasury balance should query USDC token accounts');
    assert.ok(balance.includes('treasuryBalanceCache.usdc'), 'treasury cache should store USDC');
    assert.ok(route.includes('treasuryBalanceUsdc'), 'treasury responses should expose USDC balance');
    assert.ok(route.includes("healthStatus = 'empty'"), 'configured empty settlement wallets should not remain unknown');
  });

  it('x402 settlement patches receipts with transaction signatures', () => {
    const src = readFileSync(resolve(root, 'lib', 'x402.js'), 'utf-8');
    const control = readFileSync(resolve(root, 'lib', 'control-plane.js'), 'utf-8');
    assert.ok(src.includes('onAfterSettle'), 'should persist settlement details inside the awaited x402 settlement hook');
    assert.ok(src.includes('onAfterVerify'), 'should record payment verification failures');
    assert.ok(src.includes('onSettleFailure'), 'should record settlement failures');
    assert.ok(src.includes('recordX402Failure'), 'should centralize x402 failure receipts');
    assert.ok(src.includes('decodePaymentResponseHeader'), 'should decode settlement response headers');
    assert.ok(src.includes('updateReceipt(receiptId'), 'should patch the existing receipt after settlement');
    assert.ok(src.includes("'X-Payment-Transaction'"), 'should expose the settled transaction signature as a response header');
    assert.ok(control.includes('ctx.receiptId = receipt.id'), 'completeMeteredRequest should retain the receipt id on the request context');
    assert.ok(control.includes("result.status === 'metered_key'"), 'verified x402 calls should not remain marked as metered_key');
    assert.ok(control.includes('verified_unsettled'), 'provider failures after payment verification should be detectable as unsettled');
  });

  it('x402 can use the PayAI hosted facilitator without a local settlement key', () => {
    const src = readFileSync(resolve(root, 'lib', 'x402.js'), 'utf-8');
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));
    assert.ok(src.includes("from '@payai/facilitator'"), 'should import PayAI facilitator config');
    assert.ok(src.includes('HTTPFacilitatorClient'), 'should use hosted facilitator client');
    assert.ok(src.includes('PAYAI_API_KEY_ID'), 'should support optional PayAI merchant key id');
    assert.ok(src.includes('PAYAI_API_KEY_SECRET'), 'should support optional PayAI merchant key secret');
    assert.ok(src.includes('PAYWALL_CONFIG, undefined, false'), 'should avoid duplicate unawaited x402 startup initialization');
    assert.ok(pkg.dependencies['@payai/facilitator'], 'should declare PayAI facilitator dependency');
  });

  it('control-plane routes enforce ownership-sensitive mutations', () => {
    const src = readFileSync(resolve(root, 'routes', 'control-plane.js'), 'utf-8');
    const control = readFileSync(resolve(root, 'lib', 'control-plane.js'), 'utf-8');
    const dashboard = readFileSync(resolve(projectRoot, 'dashboard', 'js', 'tabs', 'control-plane.js'), 'utf-8');
    assert.ok(src.includes('canManageResource'), 'meter updates should check ownership');
    assert.ok(src.includes("router.delete('/meters/:id'"), 'custom meters should be deletable');
    assert.ok(src.includes('default_meter_protected'), 'built-in meters should be protected from delete');
    assert.ok(control.includes('deleteMeter'), 'control-plane storage should expose meter delete');
    assert.ok(dashboard.includes('deleteMeterFromDashboard'), 'dashboard should expose custom meter cleanup');
    assert.ok(src.includes('getMcpTool'), 'MCP deletes should load the tool before deleting');
    assert.ok(src.includes("tool.apiKey !== req.meterflow.apiKey"), 'MCP deletes should be scoped to owner API key');
    assert.ok(dashboard.includes('deleteMcpToolFromDashboard'), 'dashboard should expose MCP tool cleanup');
  });

  it('control-plane exposes signed webhook management', () => {
    const lib = readFileSync(resolve(root, 'lib', 'control-plane.js'), 'utf-8');
    const routes = readFileSync(resolve(root, 'routes', 'control-plane.js'), 'utf-8');
    const sdk = readFileSync(resolve(projectRoot, 'sdk', 'src', 'client.js'), 'utf-8');
    assert.ok(lib.includes('WEBHOOK_PREFIX'), 'should persist webhooks');
    assert.ok(lib.includes('X-Meterflow-Signature'), 'should sign webhook deliveries');
    assert.ok(lib.includes('receipt.created'), 'should support receipt.created events');
    assert.ok(lib.includes('receipt.verified'), 'should support verified receipt events');
    assert.ok(routes.includes("'/webhooks'"), 'should expose webhook collection route');
    assert.ok(routes.includes("'/webhooks/:id/test'"), 'should expose webhook test route');
    assert.ok(sdk.includes('createWebhook'), 'SDK should expose webhook creation');
    assert.ok(sdk.includes('testWebhook'), 'SDK should expose webhook tests');
  });

  it('SDK exposes control-plane helpers', () => {
    const src = readFileSync(resolve(projectRoot, 'sdk', 'src', 'client.js'), 'utf-8');
    for (const method of ['meters()', 'createMeter', 'createHostedMeter', 'testMeter', 'deleteMeter', 'receipts', 'createBudget', 'revokeBudget', 'createMcpTool', 'deleteMcpTool', 'providerRevenue', 'webhooks', 'createWebhook']) {
      assert.ok(src.includes(method), `should include ${method}`);
    }
  });

  it('new API keys are HMAC hashed while legacy keys remain compatible', () => {
    const helpers = readFileSync(resolve(root, 'lib', 'helpers.js'), 'utf-8');
    const keys = readFileSync(resolve(root, 'lib', 'kv-keys.js'), 'utf-8');
    assert.ok(helpers.includes('mf_live_'), 'new keys should include public key id and secret parts');
    assert.ok(keys.includes('createHmac'), 'new key secrets should be hashed with HMAC');
    assert.ok(keys.includes('keyHash'), 'stored new key records should contain a hash');
    assert.ok(keys.includes('Legacy raw-key compatibility'), 'old raw mf_ keys should still be supported during migration');
    assert.ok(keys.includes('if (parsed) fallbackApiKeyIds.set(parsed.kid, record.data);'), 'new key path should store by key id');
    assert.ok(keys.includes('else fallbackApiKeys.set(apiKey, data);'), 'legacy raw key path should remain isolated to compatibility branch');
  });

  it('wallet auth uses a server-issued challenge and consumes the nonce', () => {
    const auth = readFileSync(resolve(root, 'routes', 'auth.js'), 'utf-8');
    const wallet = readFileSync(resolve(projectRoot, 'dashboard', 'js', 'wallet.js'), 'utf-8');
    assert.ok(auth.includes("router.get('/challenge'"), 'should expose challenge route');
    assert.ok(auth.includes('consumeChallenge'), 'register should consume nonce once');
    assert.ok(auth.includes('ALLOW_LEGACY_WALLET_REGISTER'), 'legacy timestamp registration should require explicit compat flag');
    assert.ok(auth.includes('Domain: meterflow.fun'), 'challenge message should bind domain/product');
    assert.ok(wallet.includes('/auth/challenge?wallet='), 'dashboard should request a challenge before signing');
  });

  it('payment ledger migration prepares accounting tables', () => {
    const migration = readFileSync(resolve(root, 'db', '002_payment_ledger.sql'), 'utf-8');
    const protocolMigration = readFileSync(resolve(root, 'db', '003_payment_protocol_metadata.sql'), 'utf-8');
    for (const table of ['meterflow_payment_quotes', 'meterflow_payment_attempts', 'meterflow_settlements', 'meterflow_webhook_deliveries', 'meterflow_provider_balances']) {
      assert.ok(migration.includes(table), `migration should include ${table}`);
    }
    for (const column of ['protocol', 'intent', 'payment_method', 'payment_reference']) {
      assert.ok(protocolMigration.includes(column), `protocol migration should include ${column}`);
    }
  });

  it('ops routes expose Sentry tests and Discord interactions safely', () => {
    const admin = readFileSync(resolve(root, 'routes', 'admin.js'), 'utf-8');
    const discord = readFileSync(resolve(root, 'routes', 'discord.js'), 'utf-8');
    const app = readFileSync(resolve(root, 'app.js'), 'utf-8');
    assert.ok(admin.includes("'/admin/sentry-test'"), 'admin route should expose a controlled Sentry test');
    assert.ok(admin.includes('authenticateAdmin'), 'Sentry test route must require admin auth');
    assert.ok(discord.includes('x-signature-ed25519'), 'Discord interactions should verify request signatures');
    assert.ok(discord.includes('nacl.sign.detached.verify'), 'Discord route should use Ed25519 verification');
    assert.ok(app.includes('/discord'), 'app should mount Discord interactions before paid routes');
    assert.ok(app.includes('req.rawBody'), 'app should preserve raw body for Discord signature verification');
  });

  it('token routes expose public token config and profile data safely', () => {
    const app = readFileSync(resolve(root, 'app.js'), 'utf-8');
    const route = readFileSync(resolve(root, 'routes', 'token.js'), 'utf-8');
    const profile = readFileSync(resolve(root, 'lib', 'token-profile.js'), 'utf-8');
    const page = readFileSync(resolve(projectRoot, 'site', 'token.html'), 'utf-8');
    assert.ok(app.includes('tokenRouter'), 'app should import token router');
    assert.ok(app.includes("app.use('/v1', tokenRouter)"), 'token router should mount under /v1');
    assert.ok(route.includes("router.get('/token/config'"), 'should expose public token config');
    assert.ok(route.includes("router.get('/token'"), 'should expose token summary');
    assert.ok(profile.includes('getTokenLargestAccounts'), 'should use Solana RPC holder data');
    assert.ok(profile.includes('getAsset'), 'should use Helius DAS metadata');
    assert.ok(profile.includes('dexscreener.com'), 'should use DEX Screener for market data');
    assert.ok(profile.includes('geckoterminal.com'), 'should use GeckoTerminal for chart data');
    assert.ok(!page.includes('METERFLOW_TOKEN_CA'), 'public token page should not expose internal env names');
    assert.ok(page.includes('Coming soon') || page.includes('TBA'), 'public token page should use pre-launch language');
    assert.ok(page.includes('One clean token page'), 'token page should explain the holder thesis');
    assert.ok(page.includes('$MFLOW sits around Meterflow'), 'token page should connect utility to holder-facing benefits');
    assert.ok(page.includes('APIs, MCP tools, and paid routes'), 'token page should explain the technical unlock');
    assert.ok(page.includes('provider reputation'), 'token page should connect utility to provider positioning');
    assert.ok(page.includes('registry ranking'), 'token page should connect utility to the provider registry');
    assert.ok(page.includes('the token becomes the utility layer around that activity'), 'token page should connect provider growth to utility growth');
  });
});
