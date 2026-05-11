import { Router } from 'express';
import { authenticateApiKey } from '../middleware.js';
import { createBudget, updateBudget } from '../lib/control-plane.js';
import {
  buildBudgetFromTemplate,
  getBudgetTemplate,
  listBudgetTemplates,
  simulateBudget,
} from '../lib/budget-templates.js';
import { getIntegration, listIntegrationCatalog } from '../lib/integration-catalog.js';
import { findPublicReceipt, getPublicRegistryItem, listPublicRegistry } from '../lib/public-registry.js';
import {
  buildProviderPolicy,
  evaluateProviderPolicy,
  getProviderPolicyPreset,
  listProviderPolicyPresets,
} from '../lib/provider-policies.js';

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

  const created = await createBudget(budgetInput, req.meterflow.apiKey, req.meterflow.wallet);
  const budget = await updateBudget(created.id, {
    allowedRoutes: budgetInput.allowedRoutes,
    expiresAt: budgetInput.expiresAt,
    onNewRoute: budgetInput.onNewRoute,
    metadata: budgetInput.metadata,
  });

  res.status(201).json({ budget, template: getBudgetTemplate(templateId) });
});

router.get('/registry', async (req, res) => {
  const registry = await listPublicRegistry({ category: req.query.category, status: req.query.status });
  res.json({ registry });
});

router.get('/registry/:id', async (req, res) => {
  const item = await getPublicRegistryItem(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'registry_item_not_found', message: 'Registry item not found.' });
  }
  res.json({ item });
});

router.get('/public/receipts/:id', async (req, res) => {
  const receipt = await findPublicReceipt({ receiptId: req.params.id });
  if (!receipt) {
    return res.status(404).json({ error: 'receipt_not_found', message: 'Receipt not found.' });
  }
  res.json({ receipt });
});

router.get('/public/tx/:signature', async (req, res) => {
  const receipt = await findPublicReceipt({ txSignature: req.params.signature });
  if (!receipt) {
    return res.status(404).json({ error: 'receipt_not_found', message: 'Receipt not found.' });
  }
  res.json({ receipt });
});

router.get('/integrations', (req, res) => {
  res.json({
    integrations: listIntegrationCatalog({
      category: req.query.category,
      priority: req.query.priority,
      status: req.query.status,
    }),
  });
});

router.get('/integrations/:id', (req, res) => {
  const integration = getIntegration(req.params.id);
  if (!integration) {
    return res.status(404).json({ error: 'integration_not_found', message: 'Integration not found.' });
  }
  res.json({ integration });
});

router.get('/provider-policies', (_req, res) => {
  res.json({ policies: listProviderPolicyPresets() });
});

router.get('/provider-policies/:id', (req, res) => {
  const policy = getProviderPolicyPreset(req.params.id);
  if (!policy) {
    return res.status(404).json({ error: 'policy_not_found', message: 'Provider policy preset not found.' });
  }
  res.json({ policy });
});

router.post('/provider-policies/evaluate', (req, res) => {
  const policy = buildProviderPolicy(req.body.policy || req.body);
  if (!policy) {
    return res.status(404).json({ error: 'policy_not_found', message: 'Provider policy preset not found.' });
  }

  const responseStatus = Number(req.body.responseStatus ?? req.body.event?.responseStatus ?? 0);
  if (responseStatus && (!Number.isFinite(responseStatus) || responseStatus < 100 || responseStatus > 599)) {
    return badRequest(res, 'responseStatus must be a valid HTTP status code');
  }

  const decision = evaluateProviderPolicy(policy, {
    responseStatus,
    timedOut: Boolean(req.body.timedOut ?? req.body.event?.timedOut),
    policyResult: req.body.policyResult ?? req.body.event?.policyResult,
  });

  res.json({ policy, decision });
});

export default router;
