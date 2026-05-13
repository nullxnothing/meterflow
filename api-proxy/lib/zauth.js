import { createZauthMiddleware } from '@zauthx402/sdk/middleware';
import { logger } from './logger.js';

const DEFAULT_INCLUDE_ROUTES = ['^/mcp/.*', '^/gateway/.*'];
const DEFAULT_EXCLUDE_ROUTES = ['^/health$', '^/auth/.*', '^/oauth/.*', '^/discord/.*', '^/holder/.*'];

const noop = (_req, _res, next) => next();

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

function buildRefundConfig() {
  const enabled = boolEnv('ZAUTH_REFUNDS_ENABLED', false);
  const config = {
    enabled,
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

export function createMeterflowZauthMiddleware() {
  const apiKey = cleanEnv(process.env.ZAUTH_API_KEY);
  if (!apiKey) {
    logger.info('Zauth middleware disabled: ZAUTH_API_KEY not configured');
    return noop;
  }

  try {
    const middleware = createZauthMiddleware({
      apiKey,
      mode: 'provider',
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
        redactFields: ['password', 'secret', 'apiKey', 'privateKey', 'solanaPrivateKey'],
        sampleRate: numberEnv('ZAUTH_SAMPLE_RATE', 1),
      },
      refund: buildRefundConfig(),
      debug: boolEnv('ZAUTH_DEBUG', false),
    });

    logger.info('Zauth middleware initialised', {
      includeRoutes: listEnv('ZAUTH_INCLUDE_ROUTES', DEFAULT_INCLUDE_ROUTES),
      refunds: boolEnv('ZAUTH_REFUNDS_ENABLED', false),
    });
    return middleware;
  } catch (err) {
    logger.error('Zauth middleware init failed; continuing without Zauth', { err: err.message });
    return noop;
  }
}
