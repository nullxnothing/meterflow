import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateApiKey } from '../middleware.js';
import {
  buildResourcePackPolicy,
  createResourcePackBudget,
  getResourcePack,
  listResourcePacks,
} from '../lib/resource-packs.js';
import { logger } from '../lib/logger.js';

const router = Router();

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many resource pack requests.' },
});

function invalidPack(res) {
  return res.status(404).json({ error: 'resource_pack_not_found', message: 'Resource pack not found.' });
}

router.get('/v1/resource-packs', publicLimiter, (_req, res) => {
  res.json({ packs: listResourcePacks() });
});

router.get('/v1/resource-packs/:id', publicLimiter, (req, res) => {
  const pack = getResourcePack(req.params.id);
  if (!pack) return invalidPack(res);
  res.json({ pack });
});

router.post('/v1/resource-packs/:id/policy-template', authenticateApiKey, (req, res) => {
  const template = buildResourcePackPolicy(req.params.id, req.body || {});
  if (!template) return invalidPack(res);
  res.json({ template });
});

router.post('/v1/resource-packs/:id/budgets', authenticateApiKey, async (req, res) => {
  try {
    const result = await createResourcePackBudget(req.params.id, req.body || {}, req.meterflow);
    if (!result) return invalidPack(res);
    res.status(201).json(result);
  } catch (err) {
    logger.error('Resource pack budget create failed', { pack: req.params.id, err: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to create resource pack budget.' });
  }
});

export default router;
