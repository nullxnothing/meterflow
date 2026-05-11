function normalizePath(path = '/') {
  return String(path || '/').split('?')[0].replace(/\/$/, '') || '/';
}

function matchesRoute(pattern, requestPath) {
  const normalizedPattern = normalizePath(pattern);
  const normalizedPath = normalizePath(requestPath);
  return normalizedPattern.endsWith('*')
    ? normalizedPath.startsWith(normalizedPattern.slice(0, -1))
    : normalizedPattern === normalizedPath;
}

function buildQuote(config, method) {
  return {
    error: 'payment_required',
    message: `Payment required for ${method} ${normalizePath(config.route)}`,
    meterflow: {
      route: normalizePath(config.route),
      method,
      priceUsd: Number(config.priceUsd || 0),
      asset: config.asset || 'USDC',
      network: config.network || 'solana-mainnet-beta',
      payTo: config.payTo,
      description: config.description || 'Paid Meterflow API route',
      expiresInSeconds: 300,
    },
  };
}

export function meterflowPaywall(config) {
  if (!config?.route) throw new Error('meterflowPaywall requires config.route');
  if (config.priceUsd === undefined) throw new Error('meterflowPaywall requires config.priceUsd');
  if (!config.payTo) throw new Error('meterflowPaywall requires config.payTo');

  const method = String(config.method || 'POST').toUpperCase();
  const route = normalizePath(config.route);

  return async function meterflowPaywallMiddleware(req, res, next) {
    const requestPath = normalizePath(req.path || req.originalUrl || req.url);
    if (String(req.method || 'GET').toUpperCase() !== method || !matchesRoute(route, requestPath)) return next();

    const proof = req.headers['x-payment'] || req.headers['x-meterflow-proof'];
    if (proof && typeof config.verify === 'function') {
      const verified = await config.verify(req);
      if (verified) {
        req.meterflow = { ...(req.meterflow || {}), paymentVerified: true, route, priceUsd: Number(config.priceUsd || 0) };
        await config.onEvent?.({ type: 'payment.verified', route, method, request: req });
        return next();
      }
      await config.onEvent?.({ type: 'payment.failed', route, method, request: req });
      return res.status(402).json({ ...buildQuote(config, method), error: 'payment_verification_failed' });
    }

    if (proof && !config.verify) {
      req.meterflow = { ...(req.meterflow || {}), paymentVerified: 'unverified', route, priceUsd: Number(config.priceUsd || 0) };
      await config.onEvent?.({ type: 'payment.present_unverified', route, method, request: req });
      return next();
    }

    await config.onEvent?.({ type: 'payment.quoted', route, method, request: req });
    return res.status(402).json(buildQuote(config, method));
  };
}

export async function registerMeterflowRoute({ apiKey, baseUrl = 'https://meterflow.fun/proxy', route, method = 'POST', priceUsd, asset = 'USDC', payTo, unit = 'request', status = 'test' }) {
  if (!apiKey) throw new Error('apiKey is required');
  const response = await fetch(`${String(baseUrl).replace(/\/$/, '')}/v1/meters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ route, method: String(method).toUpperCase(), priceUsd: Number(priceUsd || 0), asset, payTo, unit, status }),
  });
  if (!response.ok) throw new Error(`Meterflow meter registration failed: ${await response.text()}`);
  return response.json();
}
