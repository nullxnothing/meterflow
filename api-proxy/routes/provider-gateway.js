import { Router } from 'express';
import { authenticateApiKey } from '../middleware.js';
import { completeMeteredRequest, getRawMeter } from '../lib/control-plane.js';
import { logger } from '../lib/logger.js';

const router = Router();

const HOP_BY_HOP_HEADERS = new Set([
  'authorization',
  'connection',
  'content-length',
  'cookie',
  'host',
  'keep-alive',
  'meterflow-api-key',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'x-api-key',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-meterflow-api-key',
  'x-payment',
  'x-payment-response',
  'x-payment-signature',
  'x-transaction-signature',
]);

function safeHeaders(req, meter) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers || {})) {
    const key = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(key)) continue;
    if (key.startsWith('cf-') || key.startsWith('vercel-')) continue;
    if (Array.isArray(value)) headers[name] = value.join(', ');
    else if (value !== undefined) headers[name] = String(value);
  }

  headers['User-Agent'] = 'Meterflow-Gateway/1.0';
  headers['X-Meterflow-Meter'] = meter.id;
  headers['X-Meterflow-Provider'] = meter.providerName || meter.ownerWallet || 'provider';

  if (meter.upstreamAuth?.value) {
    if (meter.upstreamAuth.type === 'bearer') {
      headers.Authorization = `Bearer ${meter.upstreamAuth.value}`;
    } else if (meter.upstreamAuth.headerName) {
      headers[meter.upstreamAuth.headerName] = meter.upstreamAuth.value;
    }
  }
  return headers;
}

function buildTargetUrl(meter, tail, query) {
  const base = new URL(meter.targetUrl);
  const basePath = base.pathname.replace(/\/$/, '');
  const cleanTail = String(tail || '').replace(/^\/+/, '');
  base.pathname = cleanTail ? `${basePath}/${cleanTail}` : (basePath || '/');
  for (const [key, value] of Object.entries(query || {})) {
    if (Array.isArray(value)) value.forEach(item => base.searchParams.append(key, item));
    else if (value !== undefined) base.searchParams.set(key, String(value));
  }
  return base;
}

router.all('/gateway/:meterId/*', authenticateApiKey, async (req, res) => {
  const startedAt = Date.now();
  const meter = await getRawMeter(req.params.meterId);
  if (!meter || !meter.targetUrl || !meter.route?.startsWith(`/gateway/${req.params.meterId}/`)) {
    return res.status(404).json({ error: 'gateway_meter_not_found', message: 'Hosted gateway meter not found.' });
  }

  const tail = req.params[0] || '';
  const target = buildTargetUrl(meter, tail, req.query);
  let upstreamStatus = 502;
  try {
    const hasBody = !['GET', 'HEAD'].includes(req.method.toUpperCase()) && req.body !== undefined;
    const upstream = await fetch(target, {
      method: req.method,
      headers: safeHeaders(req, meter),
      body: hasBody ? JSON.stringify(req.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    upstreamStatus = upstream.status;
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const body = Buffer.from(await upstream.arrayBuffer());

    await completeMeteredRequest(req, {
      status: upstream.ok ? undefined : 'upstream_error',
      responseStatus: upstream.status,
      latencyMs: Date.now() - startedAt,
      error: upstream.ok ? null : `Upstream returned HTTP ${upstream.status}`,
    });

    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Meterflow-Meter', meter.id);
    res.setHeader('X-Meterflow-Upstream-Host', meter.targetHost);
    return res.send(body);
  } catch (err) {
    logger.warn('Hosted provider gateway failed', { meterId: meter.id, err: err.message });
    await completeMeteredRequest(req, {
      status: 'upstream_error',
      responseStatus: upstreamStatus,
      latencyMs: Date.now() - startedAt,
      error: err.message,
    });
    return res.status(502).json({ error: 'upstream_error', message: 'Hosted provider gateway request failed.' });
  }
});

export default router;
