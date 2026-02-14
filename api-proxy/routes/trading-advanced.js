import { Router } from 'express';
import { CONFIG, solanaConnection } from '../config.js';
import { tradingWallets, activeDCA, activeCopyTraders, activeTriggers } from '../state.js';
import { authenticateApiKey, requireTradingTier } from '../middleware.js';
import { getSafetyManager, getTriggerManager, recordTrade } from '../lib/trading-state.js';
import {
  loadKeypair, getEncryptionKey,
  getQuote, executeSwap,
  CopyTrader, createDCAOrder, cancelDCAOrder, getDCAOrderInfo,
} from '../trading/index.js';

const router = Router();

// POST /v1/trading/dca/create
router.post('/dca/create', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const { inputMint, outputMint, totalAmountLamports, amountPerCycleLamports, cycleIntervalMs, slippageBps, maxCycles, maxPrice } = req.body;
  if (!inputMint || !outputMint || !totalAmountLamports || !amountPerCycleLamports || !cycleIntervalMs) {
    return res.status(400).json({ error: 'missing_fields', message: 'inputMint, outputMint, totalAmountLamports, amountPerCycleLamports, cycleIntervalMs required' });
  }
  const w = tradingWallets.get(apiKey);
  if (!w) return res.status(404).json({ error: 'no_wallet', message: 'Create a wallet first.' });

  try {
    const encKey = getEncryptionKey(CONFIG.WALLET_ENCRYPTION_SECRET, apiKey);
    const keypair = loadKeypair(w.encryptedKeypair, encKey);
    const order = createDCAOrder(solanaConnection, keypair, { inputMint, outputMint, totalAmountLamports, amountPerCycleLamports, cycleIntervalMs, slippageBps, maxCycles, maxPrice });
    activeDCA.set(order.id, { apiKey, order });
    res.json(getDCAOrderInfo(order));
  } catch (err) {
    res.status(500).json({ error: 'dca_create_failed', message: err.message });
  }
});

// GET /v1/trading/dca/orders
router.get('/dca/orders', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const orders = [...activeDCA.values()]
    .filter(d => d.apiKey === apiKey)
    .map(d => getDCAOrderInfo(d.order));
  res.json(orders);
});

// POST /v1/trading/dca/:id/cancel
router.post('/dca/:id/cancel', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const entry = activeDCA.get(req.params.id);
  if (!entry || entry.apiKey !== apiKey) return res.status(404).json({ error: 'not_found', message: 'DCA order not found.' });
  cancelDCAOrder(entry.order);
  res.json({ id: req.params.id, status: 'cancelled' });
});

// POST /v1/trading/copy/follow
router.post('/copy/follow', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const { address, name, multiplier, maxPositionSol, copyBuys, copySells, slippageBps, delayMs } = req.body;
  if (!address) return res.status(400).json({ error: 'missing_fields', message: 'address required' });

  const w = tradingWallets.get(apiKey);
  if (!w) return res.status(404).json({ error: 'no_wallet', message: 'Create a wallet first.' });

  let ct = activeCopyTraders.get(apiKey);
  if (!ct) {
    const encKey = getEncryptionKey(CONFIG.WALLET_ENCRYPTION_SECRET, apiKey);
    const keypair = loadKeypair(w.encryptedKeypair, encKey);
    ct = new CopyTrader(solanaConnection, keypair, { onTrade: (data) => {
      recordTrade(apiKey, { action: 'copy_' + data.trade?.action, mint: data.trade?.mint, sig: data.result?.signature });
    }});
    activeCopyTraders.set(apiKey, ct);
  }

  const target = ct.addTarget(address, { name, multiplier, maxPositionSol, copyBuys, copySells, slippageBps, delayMs });
  res.json(target);
});

// POST /v1/trading/copy/unfollow
router.post('/copy/unfollow', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const { targetId } = req.body;
  if (!targetId) return res.status(400).json({ error: 'missing_fields', message: 'targetId required' });
  const ct = activeCopyTraders.get(apiKey);
  if (!ct) return res.status(404).json({ error: 'not_found', message: 'No copy trader active.' });
  ct.removeTarget(targetId);
  res.json({ removed: targetId });
});

// GET /v1/trading/copy/targets
router.get('/copy/targets', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const ct = activeCopyTraders.get(apiKey);
  if (!ct) return res.json({ targets: [], stats: { totalTargets: 0, activeTargets: 0, totalTradesCopied: 0, successRate: '0.0' } });
  res.json({ targets: ct.listTargets(), stats: ct.getStats() });
});

// POST /v1/trading/copy/start
router.post('/copy/start', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const ct = activeCopyTraders.get(apiKey);
  if (!ct) return res.status(404).json({ error: 'not_found', message: 'Follow a wallet first.' });
  ct.start();
  res.json({ status: 'running', targets: ct.listTargets().length });
});

// POST /v1/trading/copy/stop
router.post('/copy/stop', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const ct = activeCopyTraders.get(apiKey);
  if (!ct) return res.status(404).json({ error: 'not_found', message: 'No copy trader active.' });
  ct.stop();
  res.json({ status: 'stopped' });
});

// POST /v1/trading/trigger/create
router.post('/trigger/create', authenticateApiKey, requireTradingTier, async (req, res) => {
  const { apiKey } = req.infinite;
  const { mint, condition, order, expiresAt, oneShot } = req.body;
  if (!mint || !condition || !order) return res.status(400).json({ error: 'missing_fields', message: 'mint, condition, order required' });

  const w = tradingWallets.get(apiKey);
  if (!w) return res.status(404).json({ error: 'no_wallet', message: 'Create a wallet first.' });

  const tm = getTriggerManager(apiKey);

  if (!tm.executeFn) {
    const encKey = getEncryptionKey(CONFIG.WALLET_ENCRYPTION_SECRET, apiKey);
    const keypair = loadKeypair(w.encryptedKeypair, encKey);
    tm.setExecutor(async (trigger) => {
      const { action, inputMint, outputMint, amount, slippageBps } = trigger.order;
      const quote = await getQuote({ inputMint, outputMint, amount: String(amount), slippageBps: slippageBps || 300 });
      const result = await executeSwap(solanaConnection, keypair, quote);
      recordTrade(apiKey, { action: `trigger_${action}`, mint: trigger.mint, sig: result.signature });
      return { signature: result.signature };
    });
  }

  const trigger = tm.create({ mint, condition, order, expiresAt, oneShot });
  res.json(trigger);
});

// GET /v1/trading/trigger/list
router.get('/trigger/list', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const tm = activeTriggers.get(apiKey);
  if (!tm) return res.json([]);
  res.json(tm.list());
});

// POST /v1/trading/trigger/:id/cancel
router.post('/trigger/:id/cancel', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const tm = activeTriggers.get(apiKey);
  if (!tm) return res.status(404).json({ error: 'not_found', message: 'No triggers active.' });
  tm.cancel(req.params.id);
  res.json({ id: req.params.id, status: 'cancelled' });
});

// GET /v1/trading/safety/status
router.get('/safety/status', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const safety = getSafetyManager(apiKey);
  res.json(safety.getState());
});

// POST /v1/trading/safety/kill
router.post('/safety/kill', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const { reason } = req.body;

  const safety = getSafetyManager(apiKey);
  safety.killSwitch(reason || 'Manual kill switch from dashboard');

  const ct = activeCopyTraders.get(apiKey);
  if (ct) ct.stop();

  for (const [id, entry] of activeDCA) {
    if (entry.apiKey === apiKey) cancelDCAOrder(entry.order);
  }

  const tm = activeTriggers.get(apiKey);
  if (tm) tm.stopAll();

  res.json({ killed: true, message: 'All trading bots stopped.' });
});

// POST /v1/trading/safety/resume
router.post('/safety/resume', authenticateApiKey, requireTradingTier, (req, res) => {
  const { apiKey } = req.infinite;
  const safety = getSafetyManager(apiKey);
  const resumed = safety.resumeTrading();
  res.json({ resumed, state: safety.getState() });
});

export default router;
