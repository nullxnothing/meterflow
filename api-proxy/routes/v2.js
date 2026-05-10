import { Router } from 'express';
import { authenticateApiKey } from '../middleware.js';
import { createBudget } from '../lib/control-plane.js';
import {
  buildBudgetFromTemplate,
  getBudgetTemplate,
  listBudgetTemplates,
  simulateBudget,
} from '../lib/budget-templates.js';

const router = Router();

function badRequest(res, message, fields = {}) {
  return res.status(400).json({ error: 'invalid_request', message, fields });
}

router.get('/budget-templates', (_req, res) => {
  res.json({ templates: listBudgetTemplates() });
});

router.get('/budget-templates/:id', (req, res) => {
  const template = getBudgetTemplate(req.params.id);
  if (!template) {
    return res.status(404).json({ error: 'template_not_found', message: 'Budget template not found.' });
  }
  res.json({ template });
});

router.post('/budgets/simulate', (req, res) => {
  const dailyCapUsd = Number(req.body.dailyCapUsd ?? req.body.dailyCap ?? 0);
  const perCallCapUsd = Number(req.body.perCallCapUsd ?? req.body.perCallCap ?? 0);
  const callsPerDay = Number(req.body.callsPerDay ?? req.body.calls ?? 0);
  const averageCallPriceUsd = req.body.averageCallPriceUsd ?? req.body.avgPrice ?? null;

  if ([dailyCapUsd, perCallCapUsd, callsPerDay].some(value => !Number.isFinite(value) || value < 0)) {
    return badRequest(res, 'dailyCapUsd, perCallCapUsd, and callsPerDay must be non-negative numbers');
  }

  res.json({
    simulation: simulateBudget({
      dailyCapUsd,
      perCallCapUsd,
      callsPerDay,
      averageCallPriceUsd: averageCallPriceUsd === null ? null : Number(averageCallPriceUsd),
    }),
  });
});

router.post('/budgets/from-template', authenticateApiKey, async (req, res) => {
  const templateId = req.body.templateId || req.body.template || 'research_agent';
  const budgetInput = buildBudgetFromTemplate(templateId, req.body.overrides || req.body);

  if (!budgetInput) {
    return res.status(404).json({ error: 'template_not_found', message: 'Budget template not found.' });
  }

  if (Number(budgetInput.dailyCapUsd) < 0 || Number(budgetInput.perCallCapUsd) < 0) {
    return badRequest(res, 'Budget caps must be non-negative');
  }

  const budget = await createBudget(budgetInput, req.meterflow.apiKey, req.meterflow.wallet);
  res.status(201).json({ budget, template: getBudgetTemplate(templateId) });
});

export default router;
