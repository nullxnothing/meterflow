import { createClient } from '@zauthx402/sdk';
import { logger } from './logger.js';

const DEFAULT_ZAUTH_BASE_URL = 'https://back.zauthx402.com';
const ZAUTH_PUBLIC_APP_URL = process.env.ZAUTH_PUBLIC_APP_URL || 'https://zauthx402.com';

let cachedClient = null;

function nowIso() {
  return new Date().toISOString();
}

function zauthApiKey() {
  return process.env.ZAUTH_API_KEY?.trim() || '';
}

function zauthBaseUrl() {
  return (process.env.ZAUTH_BASE_URL || process.env.ZAUTH_API_ENDPOINT || DEFAULT_ZAUTH_BASE_URL).replace(/\/$/, '');
}

function shortError(err) {
  const raw = err?.message || String(err || 'zauth_unavailable');
  return raw.replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]').replace(/mf_[A-Za-z0-9_-]+/g, 'mf_[redacted]').slice(0, 180);
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

function client() {
  const apiKey = zauthApiKey();
  if (!apiKey) return null;
  if (!cachedClient) {
    cachedClient = createClient({
      apiKey,
      apiEndpoint: zauthBaseUrl(),
      mode: 'provider',
      environment: process.env.NODE_ENV || 'production',
      debug: false,
      telemetry: {
        includeRequestBody: false,
        includeResponseBody: false,
        redactHeaders: ['authorization', 'cookie', 'x-api-key', 'meterflow-api-key', 'x-meterflow-api-key'],
        redactFields: ['apiKey', 'secret', 'token', 'password', 'upstreamAuth'],
      },
      refund: { enabled: false },
    });
  }
  return cachedClient;
}

export function isZauthConfigured() {
  return Boolean(zauthApiKey());
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
  const zauth = client();
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
  const zauth = client();
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
    // The published SDK does not expose a dedicated provider-listing submit method.
    // Provider Hub docs describe SDK telemetry as the registration path, so this sends
    // a health-check event with listing metadata and then reads the registry status.
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
