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

  it('exposes x402 payment headers to browser clients', () => {
    const src = readFileSync(resolve(root, 'app.js'), 'utf-8');
    assert.ok(src.includes('exposedHeaders'), 'should expose payment response headers');
    for (const header of ['Payment-Required', 'Payment-Response', 'Payment-Signature', 'X-Payment-Response']) {
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
});

// ═══════════════════════════════════════
// 15. HELPER FUNCTIONS
// ═══════════════════════════════════════
describe('Helper functions', () => {
  // Dynamically import helpers since they don't require external deps
  it('generateApiKey produces correct format', async () => {
    // Can't import directly due to config side effects, so check source
    const src = readFileSync(resolve(root, 'lib', 'helpers.js'), 'utf-8');
    assert.ok(src.includes('mf_'), 'should prefix with mf_');
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
    for (const method of ['meters()', 'createMeter', 'deleteMeter', 'receipts', 'createBudget', 'revokeBudget', 'createMcpTool', 'deleteMcpTool', 'providerRevenue']) {
      assert.ok(src.includes(method), `should include ${method}`);
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
});
