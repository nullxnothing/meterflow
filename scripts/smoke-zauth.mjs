import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@zauthx402/sdk';

const DEFAULT_ENDPOINT = 'https://www.meterflow.fun/proxy/mcp/token-risk';
const DEFAULT_ZAUTH_APP = 'https://zauth.inc';

function loadEnvFiles() {
  for (const file of ['.env.zauth.local', '.env.local', '.env.production.local']) {
    if (!existsSync(file)) continue;
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

function clean(value) {
  return String(value || '').trim();
}

function canonicalMeterflowEndpoint(value) {
  return clean(value).replace(/^https:\/\/meterflow\.fun(?=\/|$)/, 'https://www.meterflow.fun');
}

function redact(value) {
  return String(value || '')
    .replace(/zauth_sk_[A-Za-z0-9_-]+/g, 'zauth_sk_[redacted]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]');
}

function publicZauthUrl(endpoint) {
  const appUrl = clean(process.env.ZAUTH_PUBLIC_APP_URL) || DEFAULT_ZAUTH_APP;
  return `${appUrl.replace(/\/$/, '')}/provider-hub?endpoint=${encodeURIComponent(endpoint)}`;
}

async function main() {
  loadEnvFiles();

  const apiKey = clean(process.env.ZAUTH_API_KEY);
  const endpoint = canonicalMeterflowEndpoint(clean(process.env.METERFLOW_ZAUTH_ENDPOINT)
    || clean(process.env.METERFLOW_SMOKE_ENDPOINT)
    || DEFAULT_ENDPOINT);
  const apiEndpoint = clean(process.env.ZAUTH_API_ENDPOINT)
    || clean(process.env.ZAUTH_BASE_URL);

  if (!apiKey) {
    console.error('Missing ZAUTH_API_KEY. Set it in the shell or .env.zauth.local before running this smoke test.');
    process.exit(1);
  }

  const zauthOptions = {
    apiKey,
    mode: 'provider',
    environment: process.env.NODE_ENV || 'development',
    debug: clean(process.env.ZAUTH_DEBUG).toLowerCase() === 'true',
    telemetry: {
      includeRequestBody: false,
      includeResponseBody: false,
      redactHeaders: ['authorization', 'cookie', 'x-api-key', 'meterflow-api-key', 'x-meterflow-api-key'],
      redactFields: ['apiKey', 'secret', 'token', 'password', 'upstreamAuth'],
    },
    refund: { enabled: false },
  };
  if (apiEndpoint) zauthOptions.apiEndpoint = apiEndpoint;

  const zauth = createClient(zauthOptions);

  try {
    await zauth.sendEvent({
      ...zauth.createEventBase('health_check'),
      url: endpoint,
      responsive: true,
      paymentRequirementsValid: true,
      paymentRequirements: [],
      responseTimeMs: 0,
      metadata: {
        name: 'Meterflow token risk MCP',
        displayName: 'Meterflow Token Risk',
        providerName: 'Meterflow',
        endpointUrl: endpoint,
        method: 'POST',
        priceUsd: 0.006,
        rail: 'x402',
        supportedRails: ['x402', 'MPP'],
        category: 'agent-api',
        website: 'https://meterflow.fun',
        description: 'Paid x402 MCP endpoint for Solana token risk checks.',
      },
    });

    const status = await zauth.checkEndpoint(endpoint);
    const summary = {
      endpoint,
      listed: Boolean(status?.listed ?? status?.working ?? status?.meaningful ?? status?.verified),
      verified: Boolean(status?.verified),
      working: Boolean(status?.working),
      meaningful: Boolean(status?.meaningful),
      checkedAt: status?.checkedAt || status?.lastChecked || null,
      uptime: status?.uptime ?? null,
      providerHub: publicZauthUrl(endpoint),
    };

    console.log(JSON.stringify(summary, null, 2));
  } catch (err) {
    console.error(`Zauth smoke test failed: ${redact(err?.message || err)}`);
    process.exitCode = 1;
  } finally {
    await zauth.shutdown?.();
  }
}

main();
