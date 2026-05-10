import { Router } from 'express';
import { authenticateApiKey } from '../middleware.js';
import {
  listMeters,
  getMeter,
  createMeter,
  updateMeter,
  deleteMeter,
  canManageResource,
  findMeterForRequest,
  listReceipts,
  listReceiptsForPrincipal,
  getReceipt,
  listBudgets,
  getBudget,
  createBudget,
  updateBudget,
  revokeBudget,
  getProviderRevenue,
  listMcpTools,
  getMcpTool,
  createMcpTool,
  deleteMcpTool,
  listWebhooks,
  getWebhook,
  createWebhook,
  deleteWebhook,
  sendWebhookTest,
  applyProtocolFee,
} from '../lib/control-plane.js';

const router = Router();

function badRequest(res, message, fields = {}) {
  return res.status(400).json({ error: 'invalid_request', message, fields });
}

function requireRoute(input, res) {
  if (!input.route || typeof input.route !== 'string' || !input.route.startsWith('/')) {
    return badRequest(res, 'route must start with /');
  }
  return null;
}

function requirePrice(input, res) {
  const price = Number(input.priceUsd ?? input.price);
  if (!Number.isFinite(price) || price < 0) {
    return badRequest(res, 'priceUsd must be a non-negative number');
  }
  return null;
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

router.get('/meters', authenticateApiKey, async (_req, res) => {
  res.json({ meters: await listMeters() });
});

router.post('/meters', authenticateApiKey, async (req, res) => {
  if (requireRoute(req.body, res) || requirePrice(req.body, res)) return;
  const meter = await createMeter(req.body, req.meterflow.wallet);
  res.status(201).json({ meter });
});

router.patch('/meters/:id', authenticateApiKey, async (req, res) => {
  const current = await getMeter(req.params.id);
  if (!current) return res.status(404).json({ error: 'meter_not_found', message: 'Meter not found.' });
  if (!canManageResource(current, req.meterflow.wallet, req.meterflow.apiKey)) {
    return res.status(403).json({ error: 'forbidden', message: 'You do not control this meter.' });
  }
  const patch = { ...req.body };
  if (patch.route && requireRoute(patch, res)) return;
  if ((patch.priceUsd !== undefined || patch.price !== undefined) && requirePrice(patch, res)) return;
  if (patch.method) patch.method = String(patch.method).toUpperCase();
  if (patch.price !== undefined && patch.priceUsd === undefined) patch.priceUsd = Number(patch.price);
  const meter = await updateMeter(req.params.id, patch);
  if (!meter) return res.status(404).json({ error: 'meter_not_found', message: 'Meter not found.' });
  res.json({ meter });
});

router.delete('/meters/:id', authenticateApiKey, async (req, res) => {
  const current = await getMeter(req.params.id);
  if (!current) return res.status(404).json({ error: 'meter_not_found', message: 'Meter not found.' });
  if (current.source === 'default') {
    return res.status(403).json({ error: 'default_meter_protected', message: 'Built-in Meterflow meters cannot be deleted.' });
  }
  if (!canManageResource(current, req.meterflow.wallet, req.meterflow.apiKey)) {
    return res.status(403).json({ error: 'forbidden', message: 'You do not control this meter.' });
  }
  await deleteMeter(req.params.id);
  res.json({ ok: true });
});

router.post('/meters/:id/test', authenticateApiKey, async (req, res) => {
  const meter = await getMeter(req.params.id);
  if (!meter) return res.status(404).json({ error: 'meter_not_found', message: 'Meter not found.' });
  const matched = await findMeterForRequest(meter.method, meter.route);
  const economics = applyProtocolFee(meter.priceUsd, req.meterflow.tier);
  res.json({
    meter,
    quote: {
      amountUsd: economics.totalAmountUsd,
      baseAmountUsd: economics.baseAmountUsd,
      protocolFeeUsd: economics.protocolFeeUsd,
      protocolFeeBps: economics.protocolFeeBps,
      asset: meter.asset,
      network: 'solana-mainnet-beta',
      paymentState: 'test_quote',
      expiresInSeconds: 300,
    },
    matched: !!matched,
  });
});

router.get('/receipts', authenticateApiKey, async (req, res) => {
  const receipts = await listReceiptsForPrincipal({
    meterId: req.query.meterId,
    status: req.query.status,
    txSignature: req.query.txSignature,
    idempotencyKey: req.query.idempotencyKey,
    apiKey: req.meterflow.apiKey,
    wallet: req.meterflow.wallet,
    limit: req.query.limit,
  });
  res.json({ receipts });
});

router.get('/receipts/export.csv', authenticateApiKey, async (req, res) => {
  const receipts = await listReceiptsForPrincipal({ apiKey: req.meterflow.apiKey, wallet: req.meterflow.wallet, limit: 500 });
  const columns = ['id', 'createdAt', 'route', 'status', 'baseAmountUsd', 'protocolFeeUsd', 'protocolFeeBps', 'amountUsd', 'asset', 'paymentState', 'paymentNetwork', 'paymentMint', 'payerWallet', 'payTo', 'txSignature', 'quoteId', 'idempotencyKey', 'policyResult', 'responseStatus', 'latencyMs', 'wallet'];
  const rows = [
    columns.join(','),
    ...receipts.map(receipt => columns.map(col => csvEscape(receipt[col])).join(',')),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="meterflow-receipts.csv"');
  res.send(rows.join('\n'));
});

router.get('/receipts/:id', authenticateApiKey, async (req, res) => {
  const receipt = await getReceipt(req.params.id);
  const ownsReceipt = receipt
    && (
      receipt.apiKey === req.meterflow.apiKey
      || receipt.wallet === req.meterflow.wallet
      || receipt.payerWallet === req.meterflow.wallet
      || receipt.agent === req.meterflow.wallet
    );
  if (!ownsReceipt) {
    return res.status(404).json({ error: 'receipt_not_found', message: 'Receipt not found.' });
  }
  res.json({ receipt });
});

router.get('/budgets', authenticateApiKey, async (req, res) => {
  res.json({ budgets: await listBudgets({ apiKey: req.meterflow.apiKey }) });
});

router.post('/budgets', authenticateApiKey, async (req, res) => {
  if (req.body.dailyCapUsd !== undefined && Number(req.body.dailyCapUsd) < 0) {
    return badRequest(res, 'dailyCapUsd must be non-negative');
  }
  if (req.body.perCallCapUsd !== undefined && Number(req.body.perCallCapUsd) < 0) {
    return badRequest(res, 'perCallCapUsd must be non-negative');
  }
  const budget = await createBudget(req.body, req.meterflow.apiKey, req.meterflow.wallet);
  res.status(201).json({ budget });
});

router.patch('/budgets/:id', authenticateApiKey, async (req, res) => {
  const current = await getBudget(req.params.id);
  if (!current || current.apiKey !== req.meterflow.apiKey) {
    return res.status(404).json({ error: 'budget_not_found', message: 'Budget not found.' });
  }
  if (req.body.dailyCapUsd !== undefined && Number(req.body.dailyCapUsd) < 0) {
    return badRequest(res, 'dailyCapUsd must be non-negative');
  }
  if (req.body.perCallCapUsd !== undefined && Number(req.body.perCallCapUsd) < 0) {
    return badRequest(res, 'perCallCapUsd must be non-negative');
  }
  const budget = await updateBudget(req.params.id, req.body);
  res.json({ budget });
});

router.post('/budgets/:id/revoke', authenticateApiKey, async (req, res) => {
  const current = await getBudget(req.params.id);
  if (!current || current.apiKey !== req.meterflow.apiKey) {
    return res.status(404).json({ error: 'budget_not_found', message: 'Budget not found.' });
  }
  res.json({ budget: await revokeBudget(req.params.id) });
});

router.get('/providers/revenue', authenticateApiKey, async (_req, res) => {
  res.json({ revenue: await getProviderRevenue() });
});

router.get('/mcp-tools', authenticateApiKey, async (req, res) => {
  res.json({ tools: await listMcpTools({ apiKey: req.meterflow.apiKey }) });
});

router.post('/mcp-tools', authenticateApiKey, async (req, res) => {
  if (!req.body.name || typeof req.body.name !== 'string') {
    return badRequest(res, 'name is required');
  }
  if (req.body.priceUsd !== undefined && requirePrice(req.body, res)) return;
  const tool = await createMcpTool(req.body, req.meterflow.apiKey, req.meterflow.wallet);
  res.status(201).json({
    tool,
    snippet: `mcp.use("${tool.name}", { gateway: "https://meterflow.fun/proxy${tool.route}", price: "${tool.priceUsd} USDC" })`,
  });
});

router.delete('/mcp-tools/:id', authenticateApiKey, async (req, res) => {
  const tool = await getMcpTool(req.params.id);
  if (!tool || tool.apiKey !== req.meterflow.apiKey) {
    return res.status(404).json({ error: 'mcp_tool_not_found', message: 'MCP tool not found.' });
  }
  await deleteMcpTool(req.params.id);
  res.json({ ok: true });
});

router.get('/webhooks', authenticateApiKey, async (req, res) => {
  res.json({ webhooks: await listWebhooks({ apiKey: req.meterflow.apiKey }) });
});

router.post('/webhooks', authenticateApiKey, async (req, res) => {
  if (!req.body.url || typeof req.body.url !== 'string') {
    return badRequest(res, 'url is required');
  }

  try {
    const webhook = await createWebhook(req.body, req.meterflow.apiKey, req.meterflow.wallet);
    res.status(201).json({ webhook });
  } catch (err) {
    return badRequest(res, err.message || 'Invalid webhook');
  }
});

router.delete('/webhooks/:id', authenticateApiKey, async (req, res) => {
  const webhook = await getWebhook(req.params.id);
  if (!webhook || webhook.apiKey !== req.meterflow.apiKey) {
    return res.status(404).json({ error: 'webhook_not_found', message: 'Webhook not found.' });
  }

  await deleteWebhook(req.params.id);
  res.json({ ok: true });
});

router.post('/webhooks/:id/test', authenticateApiKey, async (req, res) => {
  const result = await sendWebhookTest(req.params.id, req.meterflow.apiKey);
  if (!result) {
    return res.status(404).json({ error: 'webhook_not_found', message: 'Webhook not found.' });
  }
  res.json({ delivery: result });
});

export default router;
