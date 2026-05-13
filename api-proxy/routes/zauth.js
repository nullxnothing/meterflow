import { Router } from 'express';
import { authenticateAdmin, authenticateApiKey } from '../middleware.js';
import {
  canManageResource,
  getMeter,
  listBillableMeters,
  updateMeter,
} from '../lib/control-plane.js';
import {
  buildZauthSubmissionMeter,
  isZauthConfigured,
  isZauthBillableMeter,
  publicMeterEndpointUrl,
  refreshZauthStatusForMeter,
  sanitizeZauthListingStatus,
  submitEndpointToZauth,
  zauthStatusPatch,
} from '../lib/zauth.js';

const router = Router();
const DEFAULT_ZAUTH_METER_ID = 'mtr_mcp_token_risk_get';

function publicEndpointUrl(meter, tail = '') {
  return publicMeterEndpointUrl(meter, tail);
}

function isBillablePublicMeter(meter) {
  return isZauthBillableMeter(meter);
}

function meterZauthStatus(meter) {
  return sanitizeZauthListingStatus({
    listingId: meter.zauthListingId,
    listed: meter.zauthListed,
    verified: meter.zauthVerified,
    status: meter.zauthStatus,
    score: meter.zauthScore,
    url: meter.zauthUrl,
    lastCheckedAt: meter.zauthLastCheckedAt,
  });
}

function publicRegistryMeter(meter) {
  return {
    id: meter.id,
    route: meter.route,
    method: meter.method,
    unit: meter.unit,
    priceUsd: meter.priceUsd,
    asset: meter.asset,
    status: meter.status,
    mode: meter.mode,
    providerName: meter.providerName || null,
    category: meter.category || null,
    description: meter.description || null,
    docsUrl: meter.docsUrl || null,
    endpointUrl: publicEndpointUrl(meter, meter.targetUrl ? 'path' : ''),
    rails: ['x402', 'MPP'],
    zauth: {
      listed: Boolean(meter.zauthListed),
      verified: Boolean(meter.zauthVerified),
      status: meter.zauthStatus || null,
      score: Number.isFinite(Number(meter.zauthScore)) ? Number(meter.zauthScore) : null,
      url: meter.zauthUrl || null,
      lastCheckedAt: meter.zauthLastCheckedAt || null,
    },
  };
}

function buildSubmissionMeter(meter, body = {}) {
  return buildZauthSubmissionMeter(meter, body);
}

async function persistSubmitResult(meter, result, endpointUrl, autoSubmit = false) {
  return updateMeter(meter.id, zauthStatusPatch(meter, result, endpointUrl, autoSubmit));
}

async function submitMeter(req, res, meter, { autoSubmit = false } = {}) {
  if (!isBillablePublicMeter(meter)) {
    return res.status(400).json({
      error: 'meter_not_public_billable',
      message: 'Meter must be billable and expose a public Meterflow route before Zauth submission.',
    });
  }

  const submissionMeter = buildSubmissionMeter(meter, req.body || {});

  try {
    const result = await submitEndpointToZauth(submissionMeter);
    const updated = await persistSubmitResult(meter, result, submissionMeter.publicEndpointUrl, autoSubmit || req.body?.zauthAutoSubmit);

    if (!result.configured) {
      return res.status(202).json({
        configured: false,
        message: 'Zauth is not configured on this Meterflow deployment. Set ZAUTH_API_KEY to enable submission.',
        zauth: meterZauthStatus(updated),
      });
    }

    return res.json({ configured: true, submitted: true, zauth: meterZauthStatus(updated) });
  } catch (err) {
    const updated = await updateMeter(meter.id, {
      zauthError: err.safeMessage || 'Zauth submission failed.',
      zauthStatus: 'failed',
      zauthLastCheckedAt: new Date().toISOString(),
    }).catch(() => meter);
    return res.status(502).json({
      error: 'zauth_submit_failed',
      message: 'Zauth submission failed. Check ZAUTH_API_KEY/ZAUTH_API_ENDPOINT and try again.',
      zauth: meterZauthStatus(updated),
    });
  }
}

async function requireManageableMeter(req, res) {
  const meter = await getMeter(req.params.id);
  if (!meter) {
    res.status(404).json({ error: 'meter_not_found', message: 'Meter not found.' });
    return null;
  }
  if (!canManageResource(meter, req.meterflow.wallet, req.meterflow.apiKey)) {
    res.status(403).json({ error: 'forbidden', message: 'You do not control this meter.' });
    return null;
  }
  return meter;
}

router.post('/meters/:id/zauth/submit', authenticateApiKey, async (req, res) => {
  const meter = await requireManageableMeter(req, res);
  if (!meter) return;
  return submitMeter(req, res, meter);
});

router.post('/admin/zauth/submit-default', authenticateAdmin, async (req, res) => {
  const meter = await getMeter(req.body?.meterId || DEFAULT_ZAUTH_METER_ID);
  if (!meter) return res.status(404).json({ error: 'meter_not_found', message: 'Meter not found.' });
  return submitMeter(req, res, meter, { autoSubmit: true });
});

router.post('/meters/:id/zauth/refresh', authenticateApiKey, async (req, res) => {
  const meter = await requireManageableMeter(req, res);
  if (!meter) return;

  const endpointUrl = publicEndpointUrl(meter, req.body?.path || '');
  const result = await refreshZauthStatusForMeter({ ...meter, publicEndpointUrl: endpointUrl });
  const status = result.status;
  const updated = await updateMeter(meter.id, {
    zauthListingId: status.listingId || meter.zauthListingId || endpointUrl,
    zauthListed: Boolean(status.listed),
    zauthVerified: Boolean(status.verified),
    zauthStatus: status.status || 'pending',
    zauthScore: status.score,
    zauthLastCheckedAt: status.lastCheckedAt || new Date().toISOString(),
    zauthError: result.error || null,
    zauthUrl: status.url,
  });

  return res.status(result.configured ? 200 : 202).json({
    configured: isZauthConfigured(),
    zauth: meterZauthStatus(updated),
  });
});

router.get('/registry', async (_req, res) => {
  const meters = await listBillableMeters({ quiet: true, allowFallback: true });
  res.json({ meters: meters.map(publicRegistryMeter) });
});

export default router;
