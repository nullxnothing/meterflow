import { logger } from './logger.js';

const DEFAULT_ZAUTH_BASE_URL = 'https://back.zauthx402.com';
const ZAUTH_PUBLIC_APP_URL = process.env.ZAUTH_PUBLIC_APP_URL || 'https://zauthx402.com';
const DEFAULT_INCLUDE_ROUTES = ['^/mcp/.*', '^/gateway/.*'];
const DEFAULT_EXCLUDE_ROUTES = ['^/health$', '^/auth/.*', '^/oauth/.*', '^/discord/.*', '^/holder/.*'];

let sdkPromise = null;
let cachedClient = null;
let cachedProviderMiddleware = null;

function nowIso() {
  return new Date().toISOString();
}

function cleanEnv(value) {
  return String(value || '').trim();
}

function boolEnv(name, fallback = false) {
  const value = cleanEnv(process.env[name]).toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function listEnv(name, fallback) {
  const value = cleanEnv(process.env[name]);
  if (!value) return fallback;
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function zauthApiKey() {
  return cleanEnv(process.env.ZAUTH_API_KEY);
}

function zauthBaseUrl() {
  return (process.env.ZAUTH_BASE_URL || process.env.ZAUTH_API_ENDPOINT || DEFAULT_ZAUTH_BASE_URL).replace(/\/$/, '');
}

function shortError(err) {
  const raw = err?.message || String(err || 'zauth_unavailable');
  return raw
    .replace(/zauth_sk_[A-Za-z0-9_-]+/g, 'zauth_sk_[redacted]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/mf_[A-Za-z0-9_-]+/g, 'mf_[redacted]')
    .slice(0, 180);
}

async function loadZauthSdk() {
  if (!sdkPromise) {
    sdkPromise = Promise.all([
      import('@zauthx402/sdk'),
      import('@zauthx402/sdk/middleware'),
    ]).then(([sdk, middleware]) => ({
      createClient: sdk.createClient,
      zauthProvider: middleware.zauthProvider,
    })).catch(err => {
      logger.warn('Zauth SDK unavailable', { err: shortError(err) });
      return null;
    });
  }
  return sdkPromise;
}

function buildRefundConfig() {
  const config = {
    enabled: boolEnv('ZAUTH_REFUNDS_ENABLED', false),
    network: cleanEnv(process.env.ZAUTH_REFUND_NETWORK) || 'solana',
    maxRefundUsd: numberEnv('ZAUTH_MAX_REFUND_USD', 1.00),
    dailyCapUsd: numberEnv('ZAUTH_DAILY_REFUND_CAP_USD', 50.00),
    monthlyCapUsd: numberEnv('ZAUTH_MONTHLY_REFUND_CAP_USD', 500.00),
    triggers: {
      serverError: true,
      timeout: true,
      emptyResponse: true,
      schemaValidation: false,
      minMeaningfulness: numberEnv('ZAUTH_MIN_MEANINGFULNESS', 0.35),
    },
    endpoints: {
      '/mcp/token-risk': {
        expectedResponse: 'JSON object with token, market, risk, and receiptHint fields for a Solana token risk lookup.',
        maxRefundUsd: numberEnv('ZAUTH_TOKEN_RISK_MAX_REFUND_USD', 0.006),
      },
      '/gateway/*': {
        expectedResponse: 'Provider API response proxied by Meterflow for a paid hosted gateway request.',
        maxRefundUsd: numberEnv('ZAUTH_GATEWAY_MAX_REFUND_USD', 1.00),
      },
    },
  };

  const solanaPrivateKey = cleanEnv(process.env.ZAUTH_SOLANA_PRIVATE_KEY);
  const evmPrivateKey = cleanEnv(process.env.ZAUTH_REFUND_PRIVATE_KEY);
  if (solanaPrivateKey) config.solanaPrivateKey = solanaPrivateKey;
  if (evmPrivateKey) config.privateKey = evmPrivateKey;
  return config;
}

function buildProviderMiddlewareOptions() {
  return {
    apiEndpoint: zauthBaseUrl(),
    baseUrl: zauthBaseUrl(),
    includeRoutes: listEnv('ZAUTH_INCLUDE_ROUTES', DEFAULT_INCLUDE_ROUTES),
    excludeRoutes: listEnv('ZAUTH_EXCLUDE_ROUTES', DEFAULT_EXCLUDE_ROUTES),
    skipHealthChecks: true,
    validation: {
      minResponseSize: numberEnv('ZAUTH_MIN_RESPONSE_SIZE', 10),
      errorFields: ['error', 'errors'],
      rejectEmptyCollections: true,
    },
    telemetry: {
      includeRequestBody: boolEnv('ZAUTH_INCLUDE_REQUEST_BODY', false),
      includeResponseBody: boolEnv('ZAUTH_INCLUDE_RESPONSE_BODY', true),
      maxBodySize: numberEnv('ZAUTH_MAX_BODY_SIZE', 10000),
      redactHeaders: [
        'authorization',
        'cookie',
        'x-api-key',
        'meterflow-api-key',
        'x-meterflow-api-key',
        'x-payment',
        'payment-signature',
        'payment-response',
        'x-payment-response',
      ],
      redactFields: ['apiKey', 'secret', 'token', 'password', 'upstreamAuth', 'privateKey', 'solanaPrivateKey'],
      sampleRate: numberEnv('ZAUTH_SAMPLE_RATE', 1),
    },
    batching: {
      maxBatchSize: numberEnv('ZAUTH_BATCH_SIZE', 1),
      maxBatchWaitMs: numberEnv('ZAUTH_BATCH_WAIT_MS', 100),
      retry: true,
      maxRetries: numberEnv('ZAUTH_BATCH_MAX_RETRIES', 3),
    },
    refund: buildRefundConfig(),
    debug: boolEnv('ZAUTH_DEBUG', false),
  };
}

function normalizeStatus(status = {}) {
  const rawStatus = String(status.status || '').toLowerCase();
  if (rawStatus) return rawStatus;
  if (status.verified) return 'verified';
  if (status.working || status.meaningful || status.listed) return 'listed';
  return 'pending';
}

function scoreFromStatus(status = {}) {
  if (Number.isFinite(Number(status.score))) return Number(status.score);
  if (Number.isFinite(Number(status.uptime))) return Number(status.uptime);
  if (status.verified && status.meaningful) return 1;
  if (status.working || status.meaningful) return 0.75;
  return null;
}

function publicZauthUrl(status = {}, url) {
  if (typeof status.url === 'string' && status.url.startsWith('http')) return status.url;
  if (!url) return null;
  return `${ZAUTH_PUBLIC_APP_URL.replace(/\/$/, '')}/provider-hub?endpoint=${encodeURIComponent(url)}`;
}

async function client() {
  const apiKey = zauthApiKey();
  if (!apiKey) return null;
  if (cachedClient) return cachedClient;

  const sdk = await loadZauthSdk();
  if (!sdk?.createClient) return null;

  cachedClient = sdk.createClient({
    apiKey,
    apiEndpoint: zauthBaseUrl(),
    mode: 'provider',
    environment: process.env.NODE_ENV || 'production',
    debug: boolEnv('ZAUTH_DEBUG', false),
    telemetry: {
      includeRequestBody: false,
      includeResponseBody: false,
      redactHeaders: ['authorization', 'cookie', 'x-api-key', 'meterflow-api-key', 'x-meterflow-api-key'],
      redactFields: ['apiKey', 'secret', 'token', 'password', 'upstreamAuth'],
    },
    refund: { enabled: false },
  });
  return cachedClient;
}

export function isZauthConfigured() {
  return Boolean(zauthApiKey());
}

export async function createZauthProviderMiddleware() {
  const apiKey = zauthApiKey();
  if (!apiKey) return null;
  if (cachedProviderMiddleware) return cachedProviderMiddleware;

  try {
    const sdk = await loadZauthSdk();
    if (!sdk?.zauthProvider) return null;
    cachedProviderMiddleware = sdk.zauthProvider(apiKey, buildProviderMiddlewareOptions());
    logger.info('Zauth provider middleware initialised', {
      includeRoutes: listEnv('ZAUTH_INCLUDE_ROUTES', DEFAULT_INCLUDE_ROUTES),
      refunds: boolEnv('ZAUTH_REFUNDS_ENABLED', false),
    });
    return cachedProviderMiddleware;
  } catch (err) {
    logger.warn('Zauth provider middleware init failed', { err: shortError(err) });
    return null;
  }
}

export function sanitizeZauthListingStatus(status = {}) {
  if (!status) return {
    listed: false,
    verified: false,
    status: null,
    score: null,
    url: null,
    lastCheckedAt: null,
  };

  const endpointUrl = status.endpointUrl || status.url || null;
  return {
    listingId: status.listingId || status.zauthListingId || status.id || null,
    listed: Boolean(status.listed ?? status.working ?? status.meaningful ?? status.verified),
    verified: Boolean(status.verified),
    status: status.status ? normalizeStatus(status) : null,
    score: scoreFromStatus(status),
    url: publicZauthUrl(status, endpointUrl),
    lastCheckedAt: status.lastCheckedAt || status.checkedAt || status.lastChecked || null,
  };
}

export async function getZauthEndpointStatus(zauthIdOrUrl) {
  const zauth = await client();
  if (!zauth) return { configured: false, status: sanitizeZauthListingStatus(null) };
  if (!zauthIdOrUrl) return { configured: true, status: sanitizeZauthListingStatus(null) };

  const endpointUrl = String(zauthIdOrUrl);
  try {
    const checked = await zauth.checkEndpoint(endpointUrl);
    return {
      configured: true,
      status: sanitizeZauthListingStatus({
        ...checked,
        endpointUrl,
        status: checked?.verified ? 'verified' : checked?.working ? 'listed' : 'pending',
        lastCheckedAt: checked?.lastChecked || nowIso(),
      }),
    };
  } catch (err) {
    logger.warn('Zauth status check failed', { err: shortError(err) });
    return {
      configured: true,
      error: shortError(err),
      status: sanitizeZauthListingStatus({ endpointUrl, status: 'pending', lastCheckedAt: nowIso() }),
    };
  }
}

export async function submitEndpointToZauth(meter = {}) {
  const zauth = await client();
  const endpointUrl = meter.zauthEndpointUrl || meter.publicEndpointUrl || meter.endpointUrl || meter.url;
  if (!zauth) {
    return {
      configured: false,
      submitted: false,
      status: sanitizeZauthListingStatus({ endpointUrl, status: 'pending' }),
    };
  }
  if (!endpointUrl) throw new Error('endpoint_url_required');

  const metadata = {
    name: meter.name || meter.displayName || meter.id,
    displayName: meter.displayName || meter.name || meter.id,
    providerName: meter.providerName || 'Meterflow',
    endpointUrl,
    method: meter.method || 'POST',
    priceUsd: Number(meter.priceUsd || 0),
    rail: 'x402',
    supportedRails: ['x402', 'MPP'],
    category: meter.category || 'agent-api',
    docsUrl: meter.docsUrl || null,
    description: meter.description || meter.unit || 'Meterflow paid x402 endpoint',
    examplePrompt: meter.examplePrompt || null,
    contact: meter.contact || null,
    website: meter.website || 'https://meterflow.fun',
  };

  try {
    await zauth.sendEvent({
      ...zauth.createEventBase('health_check'),
      url: endpointUrl,
      responsive: true,
      paymentRequirementsValid: true,
      paymentRequirements: [],
      responseTimeMs: 0,
      metadata,
    });

    const checked = await zauth.checkEndpoint(endpointUrl);
    const status = sanitizeZauthListingStatus({
      ...checked,
      endpointUrl,
      status: checked?.verified ? 'verified' : checked?.working ? 'listed' : 'pending',
      lastCheckedAt: checked?.lastChecked || nowIso(),
    });
    return { configured: true, submitted: true, metadata, status };
  } catch (err) {
    logger.warn('Zauth endpoint submit failed', { meterId: meter.id, err: shortError(err) });
    err.safeMessage = shortError(err);
    throw err;
  }
}

export async function refreshZauthStatusForMeter(meter = {}) {
  const endpointUrl = meter.zauthEndpointUrl || meter.publicEndpointUrl || meter.endpointUrl || meter.zauthUrl;
  return getZauthEndpointStatus(endpointUrl);
}
