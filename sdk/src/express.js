function normalizeBaseUrl(baseUrl = 'https://meterflow.fun/proxy') {
  return String(baseUrl).replace(/\/$/, '');
}

function normalizePath(path = '/') {
  return String(path || '/').split('?')[0].replace(/\/$/, '') || '/';
}

function matchesRoute(pattern, requestPath) {
  const normalizedPattern = normalizePath(pattern);
  const normalizedPath = normalizePath(requestPath);
  if (normalizedPattern.endsWith('*')) {
    return normalizedPath.startsWith(normalizedPattern.slice(0, -1));
  }
  return normalizedPattern === normalizedPath;
}

function buildQuote({ route, method, priceUsd, asset, network, payTo, description }) {
  return {
    error: 'payment_required',
    message: `Payment required for ${method} ${route}`,
    meterflow: {
      route,
      method,
      priceUsd: Number(priceUsd || 0),
      asset: asset || 'USDC',
      network: network || 'solana-mainnet-beta',
      payTo,
      description: description || 'Paid Meterflow API route',
      expiresInSeconds: 300,
    },
  };
}

/**
 * Lightweight Express middleware for builders who want to declare a paid route in their own app.
 *
 * This helper intentionally does not settle payments locally. It gives API builders a standard
 * Meterflow quote shape and lets them forward paid traffic through a Meterflow gateway or verify
 * proof with a custom verifier before the handler runs.
 *
 * @param {Object} config
 * @param {string} config.route Route pattern, e.g. /api/risk-score or /api/*
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} [config.method]
 * @param {number|string} config.priceUsd
 * @param {string} [config.asset]
 * @param {string} [config.network]
 * @param {string} config.payTo Provider settlement wallet
 * @param {string} [config.description]
 * @param {(req: import('express').Request) => Promise<boolean>|boolean} [config.verify]
 * @param {(event: Object) => Promise<void>|void} [config.onEvent]
 */
export function meterflowPaywall(config) {
  if (!config?.route) throw new Error('meterflowPaywall requires config.route');
  if (config.priceUsd === undefined) throw new Error('meterflowPaywall requires config.priceUsd');
  if (!config.payTo) throw new Error('meterflowPaywall requires config.payTo');

  const method = String(config.method || 'POST').toUpperCase();
  const route = normalizePath(config.route);

  return async function meterflowPaywallMiddleware(req, res, next) {
    const requestPath = normalizePath(req.path || req.originalUrl || req.url);
    if (String(req.method || 'GET').toUpperCase() !== method || !matchesRoute(route, requestPath)) {
      return next();
    }

    const paymentHeader = req.headers['x-payment'] || req.headers['payment-signature'] || req.headers.authorization;
    const hasProof = Boolean(paymentHeader);

    if (hasProof && typeof config.verify === 'function') {
      const verified = await config.verify(req);
      if (verified) {
        req.meterflow = {
          ...(req.meterflow || {}),
          paymentVerified: true,
          route,
          priceUsd: Number(config.priceUsd || 0),
          payerWallet: req.headers['x-payment-wallet'] || null,
        };
        await config.onEvent?.({ type: 'payment.verified', route, method, request: req });
        return next();
      }

      await config.onEvent?.({ type: 'payment.failed', route, method, request: req });
      return res.status(402).json({
        ...buildQuote({ ...config, route, method }),
        error: 'payment_verification_failed',
      });
    }

    if (hasProof && !config.verify) {
      req.meterflow = {
        ...(req.meterflow || {}),
        paymentVerified: 'unverified',
        route,
        priceUsd: Number(config.priceUsd || 0),
      };
      await config.onEvent?.({ type: 'payment.present_unverified', route, method, request: req });
      return next();
    }

    await config.onEvent?.({ type: 'payment.quoted', route, method, request: req });
    return res.status(402).json(buildQuote({ ...config, route, method }));
  };
}

/**
 * Helper for apps that want to register the same route with Meterflow's hosted control plane.
 */
export async function registerMeterflowRoute({ apiKey, baseUrl, route, method = 'POST', priceUsd, asset = 'USDC', payTo, unit = 'request', status = 'test' }) {
  if (!apiKey) throw new Error('apiKey is required');
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/v1/meters`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      route,
      method: String(method).toUpperCase(),
      priceUsd: Number(priceUsd || 0),
      asset,
      payTo,
      unit,
      status,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Meterflow meter registration failed: ${text}`);
  }

  return response.json();
}
