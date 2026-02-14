import { Router } from 'express';
import { TRADING_SYSTEM_PROMPT } from '../config.js';
import { authenticateApiKey } from '../middleware.js';
import { fetchTokenInfo, incrementUsage } from '../lib/helpers.js';
import { streamAnthropicWithSystem } from '../providers/anthropic.js';
import { streamGeminiWithSystem } from '../providers/gemini.js';
import { streamOpenAIWithSystem } from '../providers/openai.js';

const router = Router();

// POST /v1/trading/analyze — AI trading analysis with optional token context
router.post('/analyze', authenticateApiKey, async (req, res) => {
  const { query, tokenAddress, messages: clientMessages, model } = req.body;
  const { tierConfig, usage, apiKey } = req.infinite;

  if (!query && (!clientMessages || !clientMessages.length)) {
    return res.status(400).json({ error: 'invalid_request', message: 'query or messages required' });
  }

  const requestedModel = model || tierConfig.models[0];
  if (!tierConfig.models.includes(requestedModel)) {
    return res.status(403).json({
      error: 'model_not_available',
      message: `${requestedModel} is not available on your ${tierConfig.label} tier.`,
      availableModels: tierConfig.models,
    });
  }

  let tokenContext = '';
  if (tokenAddress) {
    try {
      const info = await fetchTokenInfo(tokenAddress);
      const parts = [`Token: ${info.name || 'Unknown'} (${info.symbol || '?'})`, `Address: ${info.address}`];
      if (info.price) parts.push(`Price: $${info.price}`);
      if (info.marketCap) parts.push(`Market Cap: $${info.marketCap.toLocaleString()}`);
      if (info.liquidity) parts.push(`Liquidity: $${info.liquidity.toLocaleString()}`);
      if (info.change24h !== null) parts.push(`24h Change: ${info.change24h}%`);
      tokenContext = `\n\nLive token data:\n${parts.join('\n')}`;
    } catch {}
  }

  const messages = clientMessages || [{ role: 'user', content: query }];
  const systemMsg = TRADING_SYSTEM_PROMPT + tokenContext;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    if (requestedModel.startsWith('claude')) {
      await streamAnthropicWithSystem(requestedModel, systemMsg, messages, 4096, 0.7, res);
    } else if (requestedModel.startsWith('gemini')) {
      await streamGeminiWithSystem(requestedModel, systemMsg, messages, 4096, 0.7, res);
    } else if (requestedModel.startsWith('gpt-')) {
      await streamOpenAIWithSystem(requestedModel, systemMsg, messages, 4096, 0.7, res);
    }

    await incrementUsage(apiKey);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Trading analysis error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

// GET /v1/trading/token/:address — Fetch token info
router.get('/token/:address', authenticateApiKey, async (req, res) => {
  try {
    const info = await fetchTokenInfo(req.params.address);
    res.json(info);
  } catch (err) {
    console.error('Token lookup error:', err.message);
    res.status(502).json({ error: 'lookup_failed', message: err.message });
  }
});

export default router;
