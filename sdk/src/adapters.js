import { meterflowPaywall } from './express.js';

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

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  return headers[name.toLowerCase()] || headers[name] || null;
}

function hasPaymentProof(headers) {
  return Boolean(
    headerValue(headers, 'x-payment')
    || headerValue(headers, 'payment-signature')
    || headerValue(headers, 'authorization')
  );
}

function assertConfig(config) {
  if (!config?.route) throw new Error('Meterflow adapter requires config.route');
  if (config.priceUsd === undefined) throw new Error('Meterflow adapter requires config.priceUsd');
  if (!config.payTo) throw new Error('Meterflow adapter requires config.payTo');
}

/**
 * Fastify preHandler adapter.
 *
 * fastify.post('/api/risk-score', {
 *   preHandler: fastifyMeterflowPaywall({ route: '/api/risk-score', priceUsd: 0.006, payTo })
 * }, handler)
 */
export function fastifyMeterflowPaywall(config) {
  assertConfig(config);
  const method = String(config.method || 'POST').toUpperCase();

  return async function fastifyMeterflowPreHandler(request, reply) {
    const requestPath = normalizePath(request.routerPath || request.url || request.raw?.url || '/');
    if (String(request.method || 'GET').toUpperCase() !== method || !matchesRoute(config.route, requestPath)) return;

    const proofPresent = hasPaymentProof(request.headers);
    if (proofPresent && typeof config.verify === 'function') {
      const verified = await config.verify(request);
      if (verified) {
        request.meterflow = {
          ...(request.meterflow || {}),
          paymentVerified: true,
          route: normalizePath(config.route),
          priceUsd: Number(config.priceUsd || 0),
          payerWallet: headerValue(request.headers, 'x-payment-wallet'),
        };
        await config.onEvent?.({ type: 'payment.verified', route: normalizePath(config.route), method, request });
        return;
      }

      await config.onEvent?.({ type: 'payment.failed', route: normalizePath(config.route), method, request });
      return reply.code(402).send({
        ...buildQuote(config, method),
        error: 'payment_verification_failed',
      });
    }

    if (proofPresent && !config.verify) {
      request.meterflow = {
        ...(request.meterflow || {}),
        paymentVerified: 'unverified',
        route: normalizePath(config.route),
        priceUsd: Number(config.priceUsd || 0),
      };
      await config.onEvent?.({ type: 'payment.present_unverified', route: normalizePath(config.route), method, request });
      return;
    }

    await config.onEvent?.({ type: 'payment.quoted', route: normalizePath(config.route), method, request });
    return reply.code(402).send(buildQuote(config, method));
  };
}

/**
 * Hono middleware adapter.
 *
 * app.use('/api/risk-score', honoMeterflowPaywall({ route: '/api/risk-score', priceUsd: 0.006, payTo }))
 */
export function honoMeterflowPaywall(config) {
  assertConfig(config);
  const method = String(config.method || 'POST').toUpperCase();

  return async function honoMeterflowMiddleware(c, next) {
    const requestPath = normalizePath(new URL(c.req.url).pathname);
    if (String(c.req.method || 'GET').toUpperCase() !== method || !matchesRoute(config.route, requestPath)) {
      return next();
    }

    const proofPresent = hasPaymentProof(c.req.raw.headers);
    if (proofPresent && typeof config.verify === 'function') {
      const verified = await config.verify(c);
      if (verified) {
        c.set?.('meterflow', {
          paymentVerified: true,
          route: normalizePath(config.route),
          priceUsd: Number(config.priceUsd || 0),
          payerWallet: headerValue(c.req.raw.headers, 'x-payment-wallet'),
        });
        await config.onEvent?.({ type: 'payment.verified', route: normalizePath(config.route), method, context: c });
        return next();
      }
      await config.onEvent?.({ type: 'payment.failed', route: normalizePath(config.route), method, context: c });
      return c.json({ ...buildQuote(config, method), error: 'payment_verification_failed' }, 402);
    }

    if (proofPresent && !config.verify) {
      c.set?.('meterflow', {
        paymentVerified: 'unverified',
        route: normalizePath(config.route),
        priceUsd: Number(config.priceUsd || 0),
      });
      await config.onEvent?.({ type: 'payment.present_unverified', route: normalizePath(config.route), method, context: c });
      return next();
    }

    await config.onEvent?.({ type: 'payment.quoted', route: normalizePath(config.route), method, context: c });
    return c.json(buildQuote(config, method), 402);
  };
}

/**
 * Fetch/Cloudflare Worker style adapter.
 */
export function fetchMeterflowPaywall(config) {
  assertConfig(config);
  const method = String(config.method || 'POST').toUpperCase();

  return async function meterflowFetchGuard(request) {
    const url = new URL(request.url);
    const requestPath = normalizePath(url.pathname);
    if (String(request.method || 'GET').toUpperCase() !== method || !matchesRoute(config.route, requestPath)) return null;

    const proofPresent = hasPaymentProof(request.headers);
    if (proofPresent && typeof config.verify === 'function') {
      const verified = await config.verify(request);
      if (verified) {
        await config.onEvent?.({ type: 'payment.verified', route: normalizePath(config.route), method, request });
        return null;
      }
      await config.onEvent?.({ type: 'payment.failed', route: normalizePath(config.route), method, request });
      return Response.json({ ...buildQuote(config, method), error: 'payment_verification_failed' }, { status: 402 });
    }

    if (proofPresent && !config.verify) {
      await config.onEvent?.({ type: 'payment.present_unverified', route: normalizePath(config.route), method, request });
      return null;
    }

    await config.onEvent?.({ type: 'payment.quoted', route: normalizePath(config.route), method, request });
    return Response.json(buildQuote(config, method), { status: 402 });
  };
}

/**
 * Next.js route handler helper.
 *
 * export const POST = nextMeterflowPaywall(config, async (request) => Response.json(...))
 */
export function nextMeterflowPaywall(config, handler) {
  const guard = fetchMeterflowPaywall(config);
  if (typeof handler !== 'function') throw new Error('nextMeterflowPaywall requires a route handler function');

  return async function meterflowNextRouteHandler(request, context) {
    const blocked = await guard(request);
    if (blocked) return blocked;
    return handler(request, context);
  };
}

export { meterflowPaywall as expressMeterflowPaywall };
