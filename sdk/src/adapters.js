import { meterflowPaywall } from './express.js';

function normalizePath(path = '/') {
  return String(path || '/').split('?')[0].replace(/\/$/, '') || '/';
}

function matchesRoute(pattern, requestPath) {
  const a = normalizePath(pattern);
  const b = normalizePath(requestPath);
  return a.endsWith('*') ? b.startsWith(a.slice(0, -1)) : a === b;
}

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  return headers[name.toLowerCase()] || headers[name] || null;
}

function hasProof(headers) {
  return Boolean(headerValue(headers, 'x-payment') || headerValue(headers, 'x-meterflow-proof'));
}

function assertConfig(config) {
  if (!config?.route) throw new Error('Meterflow adapter requires config.route');
  if (config.priceUsd === undefined) throw new Error('Meterflow adapter requires config.priceUsd');
  if (!config.payTo) throw new Error('Meterflow adapter requires config.payTo');
}

function quote(config, method) {
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

export function fastifyMeterflowPaywall(config) {
  assertConfig(config);
  const method = String(config.method || 'POST').toUpperCase();
  return async function preHandler(request, reply) {
    const requestPath = normalizePath(request.routerPath || request.url || request.raw?.url || '/');
    if (String(request.method || 'GET').toUpperCase() !== method || !matchesRoute(config.route, requestPath)) return;
    const proof = hasProof(request.headers);
    if (proof && typeof config.verify === 'function') {
      const verified = await config.verify(request);
      if (verified) return;
      return reply.code(402).send({ ...quote(config, method), error: 'payment_verification_failed' });
    }
    if (proof) return;
    return reply.code(402).send(quote(config, method));
  };
}

export function honoMeterflowPaywall(config) {
  assertConfig(config);
  const method = String(config.method || 'POST').toUpperCase();
  return async function middleware(c, next) {
    const requestPath = normalizePath(new URL(c.req.url).pathname);
    if (String(c.req.method || 'GET').toUpperCase() !== method || !matchesRoute(config.route, requestPath)) return next();
    const proof = hasProof(c.req.raw.headers);
    if (proof && typeof config.verify === 'function') {
      const verified = await config.verify(c);
      if (verified) return next();
      return c.json({ ...quote(config, method), error: 'payment_verification_failed' }, 402);
    }
    if (proof) return next();
    return c.json(quote(config, method), 402);
  };
}

export function fetchMeterflowPaywall(config) {
  assertConfig(config);
  const method = String(config.method || 'POST').toUpperCase();
  return async function guard(request) {
    const requestPath = normalizePath(new URL(request.url).pathname);
    if (String(request.method || 'GET').toUpperCase() !== method || !matchesRoute(config.route, requestPath)) return null;
    const proof = hasProof(request.headers);
    if (proof && typeof config.verify === 'function') {
      const verified = await config.verify(request);
      if (verified) return null;
      return Response.json({ ...quote(config, method), error: 'payment_verification_failed' }, { status: 402 });
    }
    if (proof) return null;
    return Response.json(quote(config, method), { status: 402 });
  };
}

export function nextMeterflowPaywall(config, handler) {
  const guard = fetchMeterflowPaywall(config);
  if (typeof handler !== 'function') throw new Error('nextMeterflowPaywall requires a handler');
  return async function routeHandler(request, context) {
    const blocked = await guard(request);
    if (blocked) return blocked;
    return handler(request, context);
  };
}

export { meterflowPaywall as expressMeterflowPaywall };
