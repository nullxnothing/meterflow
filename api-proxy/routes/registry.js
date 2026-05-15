import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateAdmin } from '../middleware.js';
import {
  createRegistryProvider,
  getRegistryProvider,
  getRegistrySummary,
  listRegistryProviders,
  updateRegistryProvider,
} from '../lib/provider-registry.js';
import { logger } from '../lib/logger.js';

const router = Router();

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many registry requests.' },
});

router.get('/v1/registry/summary', publicLimiter, async (_req, res) => {
  try {
    const summary = await getRegistrySummary();
    res.json({ summary });
  } catch (err) {
    logger.error('Provider registry summary failed', { err: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to load registry summary.' });
  }
});

router.get('/v1/registry/providers', publicLimiter, async (req, res) => {
  try {
    const providers = await listRegistryProviders(req.query);
    res.json({ providers });
  } catch (err) {
    logger.error('Provider registry list failed', { err: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to load registry providers.' });
  }
});

router.get('/v1/registry/providers/:id', publicLimiter, async (req, res) => {
  try {
    const provider = await getRegistryProvider(req.params.id);
    if (!provider) {
      return res.status(404).json({ error: 'provider_not_found', message: 'Registry provider not found.' });
    }
    res.json({ provider });
  } catch (err) {
    logger.error('Provider registry read failed', { id: req.params.id, err: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to load registry provider.' });
  }
});

router.post('/admin/registry/providers', authenticateAdmin, async (req, res) => {
  try {
    const provider = await createRegistryProvider(req.body, { source: 'admin' });
    res.status(201).json({ provider });
  } catch (err) {
    if (err.fields) {
      return res.status(400).json({ error: 'invalid_provider', message: 'Missing required registry provider fields.', fields: err.fields });
    }
    logger.error('Provider registry create failed', { err: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to create registry provider.' });
  }
});

router.patch('/admin/registry/providers/:id', authenticateAdmin, async (req, res) => {
  try {
    const provider = await updateRegistryProvider(req.params.id, req.body);
    if (!provider) {
      return res.status(404).json({ error: 'provider_not_found', message: 'Registry provider not found.' });
    }
    res.json({ provider });
  } catch (err) {
    logger.error('Provider registry update failed', { id: req.params.id, err: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to update registry provider.' });
  }
});

export default router;
