import { Router } from 'express';
import { CONFIG, solanaConnection } from '../config.js';
import { tradingWallets } from '../state.js';
import { authenticateApiKey, requireTradingTier } from '../middleware.js';
import { getSafetyManager, getPositions, recordTrade } from '../lib/trading-state.js';
import { persistWallet, loadWallet } from '../lib/kv-wallets.js';
import {
  generateWallet, importWallet, loadKeypair, getEncryptionKey, getSolBalance,
  getQuote, executeSwap, SOL_MINT,
  executePumpTrade,
} from '../trading/index.js';

const router = Router();

// Rate limit wallet export: max 3 per hour per API key
const exportAttempts = new Map(); // apiKey -> [timestamps]
const EXPORT_LIMIT = 3;
const EXPORT_WINDOW_MS = 60 * 60 * 1000;

function checkExportRateLimit(apiKey) {
  const now = Date.now();
  const attempts = (exportAttempts.get(apiKey) || []).filter(t => now - t < EXPORT_WINDOW_MS);
  exportAttempts.set(apiKey, attempts);
  if (attempts.length >= EXPORT_LIMIT) return false;
  attempts.push(now);
  return true;
}

async function getOrLoadWallet(apiKey) {
  let w = tradingWallets.get(apiKey);
  if (!w) {
    const persisted = await loadWallet(apiKey);
    if (persisted) { tradingWallets.set(apiKey, persisted); w = persisted; }
  }
  return w || null;
}

// POST /v1/trading/wallet/create
router.post('/wallet/create', authenticateApiKey, requireTradingTier, async (req, res) => {
  const { apiKey } = req.meterflow;
  if (tradingWallets.has(apiKey)) {
    const existing = tradingWallets.get(apiKey);
    return res.json({ publicKey: existing.publicKey, message: 'Wallet already exists.' });
  }
  // Check Redis for previously persisted wallet
  const persisted = await loadWallet(apiKey);
  if (persisted) {
    tradingWallets.set(apiKey, persisted);
    return res.json({ publicKey: persisted.publicKey, message: 'Wallet restored.' });
  }
  const encKey = getEncryptionKey(CONFIG.WALLET_ENCRYPTION_SECRET, apiKey);
  const wallet = generateWallet(encKey);
  tradingWallets.set(apiKey, wallet);
  await persistWallet(apiKey, wallet);
  res.json({ publicKey: wallet.publicKey, message: 'Burner wallet created. Fund it with SOL to start trading.' });
});

// POST /v1/trading/wallet/import
router.post('/wallet/import', authenticateApiKey, requireTradingTier, async (req, res) => {
  const { apiKey } = req.meterflow;
  const { privateKey } = req.body;
  if (!privateKey) return res.status(400).json({ error: 'missing_field', message: 'privateKey is required' });
  try {
    const encKey = getEncryptionKey(CONFIG.WALLET_ENCRYPTION_SECRET, apiKey);
    const wallet = importWallet(privateKey, encKey);
    tradingWallets.set(apiKey, wallet);
    await persistWallet(apiKey, wallet);
    res.json({ publicKey: wallet.publicKey, message: 'Wallet imported.' });
  } catch (err) {
    res.status(400).json({ error: 'import_failed', message: err.message });
  }
});

// GET /v1/trading/wallet/info
router.get('/wallet/info', authenticateApiKey, requireTradingTier, async (req, res) => {
  const { apiKey } = req.meterflow;
  const w = await getOrLoadWallet(apiKey);
  if (!w) return res.status(404).json({ error: 'no_wallet', message: 'Create a wallet first via POST /v1/trading/wallet/create' });
  try {
    const solBalance = await getSolBalance(solanaConnection, w.publicKey);
    const positions = [...(await getPositions(apiKey)).entries()].map(([mint, p]) => ({ mint, ...p }));
    res.json({ publicKey: w.publicKey, solBalance, positions, createdAt: w.createdAt });
  } catch (err) {
    res.status(502).json({ error: 'balance_check_failed', message: err.message });
  }
});

// POST /v1/trading/wallet/export
router.post('/wallet/export', authenticateApiKey, requireTradingTier, async (req, res) => {
  const { apiKey } = req.meterflow;
  const { confirm } = req.body;
  if (!confirm) return res.status(400).json({ error: 'confirmation_required', message: 'Set { confirm: true } to export private key.' });
  if (!checkExportRateLimit(apiKey)) {
    return res.status(429).json({ error: 'rate_limited', message: 'Private key export is limited to 3 times per hour.' });
  }
  const w = await getOrLoadWallet(apiKey);
  if (!w) return res.status(404).json({ error: 'no_wallet', message: 'No wallet found.' });
  try {
    const encKey = getEncryptionKey(CONFIG.WALLET_ENCRYPTION_SECRET, apiKey);
    const keypair = loadKeypair(w.encryptedKeypair, encKey);
    const privateKey = Buffer.from(keypair.secretKey).toString('base64');
    res.json({ publicKey: w.publicKey, privateKey });
  } catch (err) {
    res.status(500).json({ error: 'export_failed', message: err.message });
  }
});

// POST /v1/trading/swap/quote
router.post('/swap/quote', authenticateApiKey, requireTradingTier, async (req, res) => {
  const { inputMint, outputMint, amount, slippageBps } = req.body;
  if (!inputMint || !outputMint || !amount) {
    return res.status(400).json({ error: 'missing_fields', message: 'inputMint, outputMint, amount required' });
  }
  try {
    const quote = await getQuote({ inputMint, outputMint, amount: String(amount), slippageBps });
    res.json(quote);
  } catch (err) {
    res.status(502).json({ error: 'quote_failed', message: err.message });
  }
});

// POST /v1/trading/swap
router.post('/swap', authenticateApiKey, requireTradingTier, async (req, res) => {
  const { apiKey } = req.meterflow;
  const { inputMint, outputMint, amount, slippageBps, priorityFeeLamports } = req.body;
  if (!inputMint || !outputMint || !amount) {
    return res.status(400).json({ error: 'missing_fields', message: 'inputMint, outputMint, amount required' });
  }
  const w = await getOrLoadWallet(apiKey);
  if (!w) return res.status(404).json({ error: 'no_wallet', message: 'Create a wallet first.' });

  const safety = getSafetyManager(apiKey);
  const solAmount = inputMint === SOL_MINT ? Number(amount) / 1e9 : 0;
  const check = safety.validateTrade({ action: 'buy', solAmount, mint: outputMint });
  if (!check.allowed) return res.status(403).json({ error: 'safety_blocked', message: check.reason });

  try {
    const encKey = getEncryptionKey(CONFIG.WALLET_ENCRYPTION_SECRET, apiKey);
    const keypair = loadKeypair(w.encryptedKeypair, encKey);
    const quote = await getQuote({ inputMint, outputMint, amount: String(amount), slippageBps });
    const result = await executeSwap(solanaConnection, keypair, quote, { priorityFeeLamports });
    await recordTrade(apiKey, { action: 'swap', inputMint, outputMint, amount, sig: result.signature });
    res.json({ signature: result.signature, inputAmount: result.inputAmount, outputAmount: result.outputAmount });
  } catch (err) {
    res.status(502).json({ error: 'swap_failed', message: err.message });
  }
});

// POST /v1/trading/pump/buy
router.post('/pump/buy', authenticateApiKey, requireTradingTier, async (req, res) => {
  const { apiKey } = req.meterflow;
  const { mint, amount, denominatedInSol = true, slippage, priorityFee, pool } = req.body;
  if (!mint || amount === undefined) return res.status(400).json({ error: 'missing_fields', message: 'mint, amount required' });
  const w = await getOrLoadWallet(apiKey);
  if (!w) return res.status(404).json({ error: 'no_wallet', message: 'Create a wallet first.' });

  const safety = getSafetyManager(apiKey);
  const check = safety.validateTrade({ action: 'buy', solAmount: denominatedInSol ? amount : 0, mint });
  if (!check.allowed) return res.status(403).json({ error: 'safety_blocked', message: check.reason });

  try {
    const encKey = getEncryptionKey(CONFIG.WALLET_ENCRYPTION_SECRET, apiKey);
    const keypair = loadKeypair(w.encryptedKeypair, encKey);
    const result = await executePumpTrade(solanaConnection, keypair, { mint, action: 'buy', amount, denominatedInSol, slippage, priorityFee, pool });
    await recordTrade(apiKey, { action: 'pump_buy', mint, amount, sig: result.signature });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'pump_buy_failed', message: err.message });
  }
});

// POST /v1/trading/pump/sell
router.post('/pump/sell', authenticateApiKey, requireTradingTier, async (req, res) => {
  const { apiKey } = req.meterflow;
  const { mint, amount, denominatedInSol = false, slippage, priorityFee, pool } = req.body;
  if (!mint || amount === undefined) return res.status(400).json({ error: 'missing_fields', message: 'mint, amount required' });
  const w = await getOrLoadWallet(apiKey);
  if (!w) return res.status(404).json({ error: 'no_wallet', message: 'Create a wallet first.' });

  const safety = getSafetyManager(apiKey);
  const check = safety.validateTrade({ action: 'sell', solAmount: denominatedInSol ? amount : 0, mint });
  if (!check.allowed) return res.status(403).json({ error: 'safety_blocked', message: check.reason });

  try {
    const encKey = getEncryptionKey(CONFIG.WALLET_ENCRYPTION_SECRET, apiKey);
    const keypair = loadKeypair(w.encryptedKeypair, encKey);
    const result = await executePumpTrade(solanaConnection, keypair, { mint, action: 'sell', amount, denominatedInSol, slippage, priorityFee, pool });
    await recordTrade(apiKey, { action: 'pump_sell', mint, amount, sig: result.signature });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'pump_sell_failed', message: err.message });
  }
});

export default router;
