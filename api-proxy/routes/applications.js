import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateAdmin } from '../middleware.js';
import {
  createProviderApplication,
  listProviderApplications,
  updateProviderApplication,
  getApplicationPipelineMetrics,
  applicationsToCsv,
} from '../lib/provider-applications.js';
import { logger } from '../lib/logger.js';

const router = Router();

const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many provider applications from this network. Try again later.' },
});

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress || '';
}

router.post('/applications/provider', applyLimiter, async (req, res) => {
  try {
    const application = await createProviderApplication(req.body, {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'],
      source: 'website_apply',
    });
    res.status(201).json({ application });
  } catch (err) {
    if (err.fields) {
      return res.status(400).json({ error: 'invalid_application', message: 'Missing required application fields.', fields: err.fields });
    }
    logger.error('Provider application submit failed', { err: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to save provider application.' });
  }
});

router.get('/admin/applications', authenticateAdmin, async (req, res) => {
  try {
    const applications = await listProviderApplications({
      status: req.query.status,
      limit: req.query.limit,
    });
    const metrics = getApplicationPipelineMetrics(applications);
    res.json({ applications, metrics });
  } catch (err) {
    logger.error('Provider application admin list failed', { err: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to load provider applications.' });
  }
});

router.get('/admin/applications/export.csv', authenticateAdmin, async (req, res) => {
  try {
    const applications = await listProviderApplications({ limit: 500 });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="meterflow-provider-applications.csv"');
    res.send(applicationsToCsv(applications));
  } catch (err) {
    logger.error('Provider application admin export failed', { err: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to export provider applications.' });
  }
});

router.patch('/admin/applications/:id', authenticateAdmin, async (req, res) => {
  try {
    const application = await updateProviderApplication(req.params.id, req.body);
    if (!application) {
      return res.status(404).json({ error: 'application_not_found', message: 'Provider application not found.' });
    }
    res.json({ application });
  } catch (err) {
    logger.error('Provider application admin update failed', { id: req.params.id, err: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to update provider application.' });
  }
});

export default router;
