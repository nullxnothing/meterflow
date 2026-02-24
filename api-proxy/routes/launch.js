// Token Launch — creator fees routed to Infinite treasury
import { Router } from 'express';
import { authenticateApiKey } from '../middleware.js';
import { CONFIG } from '../config.js';
import { logger } from '../lib/logger.js';

const router = Router();
const log = logger.child({ mod: 'launch' });
const PUMPPORTAL_API = 'https://pumpportal.fun/api/trade-local';
const PUMP_IPFS = 'https://pump.fun/api/ipfs';
const TREASURY_WALLET = CONFIG.TREASURY_WALLET;

// POST /v1/launch/create — Build a token creation transaction
router.post('/launch/create', authenticateApiKey, async (req, res) => {
  const { name, symbol, description, twitter, telegram, website, imageUrl, devBuySol = 0, pool = 'pump' } = req.body;

  if (!name || !symbol) return res.status(400).json({ error: 'name and symbol required' });
  if (name.length > 32) return res.status(400).json({ error: 'name too long (max 32)' });
  if (symbol.length > 10) return res.status(400).json({ error: 'symbol too long (max 10)' });

  try {
    // Step 1: Upload metadata to IPFS via pump.fun
    const formData = new FormData();
    formData.append('name', name);
    formData.append('symbol', symbol);
    formData.append('description', description || `Launched via Infinite Protocol. Creator fees fund AI tools for all holders.`);
    if (twitter) formData.append('twitter', twitter);
    if (telegram) formData.append('telegram', telegram);
    if (website) formData.append('website', website);
    formData.append('showName', 'true');

    // If imageUrl provided, fetch and attach it
    if (imageUrl) {
      const imgRes = await fetch(imageUrl);
      const imgBlob = await imgRes.blob();
      formData.append('file', imgBlob, 'token.png');
    }

    const ipfsRes = await fetch(PUMP_IPFS, { method: 'POST', body: formData });
    if (!ipfsRes.ok) {
      const err = await ipfsRes.text();
      throw new Error(`IPFS upload failed: ${err}`);
    }
    const ipfsData = await ipfsRes.json();

    res.json({
      ok: true,
      metadataUri: ipfsData.metadataUri,
      tokenMetadata: { name, symbol, uri: ipfsData.metadataUri },
      treasury: TREASURY_WALLET,
      description: description || `Launched via Infinite Protocol.`,
      launchConfig: {
        action: 'create',
        tokenMetadata: { name, symbol, uri: ipfsData.metadataUri },
        denominatedInSol: 'true',
        amount: devBuySol || 0,
        slippage: 10,
        priorityFee: 0.0005,
        pool,
      },
    });
  } catch (err) {
    log.error('Token launch failed', { name, symbol, err: err.message });
    res.status(502).json({ error: 'launch_failed', message: err.message });
  }
});

// GET /v1/launch/info — Get launch platform info
router.get('/launch/info', async (req, res) => {
  res.json({
    treasury: TREASURY_WALLET,
    feeModel: 'Creator fees are routed to the Infinite treasury, funding AI tools for all holders.',
    supported: ['pump'],
    howItWorks: [
      'You launch a token via pump.fun',
      'Set the Infinite treasury as the fee recipient',
      'Creator fees fund AI access for all token holders',
      'More trading = more budget = better tools',
    ],
  });
});

export default router;
