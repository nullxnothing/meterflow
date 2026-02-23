import { Router } from 'express';
import crypto from 'crypto';
import { authenticateApiKey } from '../middleware.js';
import { incrementUsage } from '../lib/helpers.js';
import { logger } from '../lib/logger.js';
import { captureError } from '../lib/sentry.js';
import { getProviderForModel, isModelAvailable, translateToolsForProvider, injectImagesIntoMessages } from '../lib/providers.js';
import { getSystemPromptWithContext } from '../lib/system-prompt.js';
import { detectOptimalModel } from '../lib/router.js';
import { proxyAnthropic, streamAnthropic } from '../providers/anthropic.js';
import { proxyGemini, streamGemini } from '../providers/gemini.js';
import { proxyOpenAI, streamOpenAI } from '../providers/openai.js';

const router = Router();

// POST /v1/chat — Proxy to Claude, Gemini, or OpenAI
router.post('/chat', authenticateApiKey, async (req, res) => {
  const { model, messages, max_tokens, temperature } = req.body;
  const { tierConfig, usage, apiKey } = req.infinite;

  let requestedModel = model || tierConfig.models[0];
  let routingReason = null;

  // Auto-routing: detect optimal model from prompt content
  const availableModels = tierConfig.models.filter(m => m !== 'auto');
  if (requestedModel === 'auto') {
    const routing = detectOptimalModel(messages, availableModels);
    requestedModel = routing.model;
    routingReason = routing.reason;
  }

  if (!availableModels.includes(requestedModel)) {
    return res.status(403).json({
      error: 'model_not_available',
      message: `${requestedModel} is not available on your ${tierConfig.label} tier.`,
      availableModels
    });
  }

  if (!isModelAvailable(requestedModel)) {
    return res.status(503).json({
      error: 'model_coming_soon',
      message: `${requestedModel} is coming soon. Stay tuned.`,
      availableModels: availableModels.filter(isModelAvailable),
    });
  }

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'messages array is required'
    });
  }

  try {
    let result;

    if (requestedModel.startsWith('claude')) {
      result = await proxyAnthropic(requestedModel, messages, max_tokens || 1024, temperature);
    } else if (requestedModel.startsWith('gemini')) {
      result = await proxyGemini(requestedModel, messages, max_tokens || 1024, temperature);
    } else if (requestedModel.startsWith('gpt-')) {
      result = await proxyOpenAI(requestedModel, messages, max_tokens || 1024, temperature);
    } else {
      return res.status(400).json({ error: 'unknown_model', message: `Unknown model: ${requestedModel}` });
    }

    const newUsage = await incrementUsage(apiKey, result.usage?.totalTokens || 0);

    res.json({
      id: `inf-${crypto.randomBytes(12).toString('hex')}`,
      model: requestedModel,
      ...(routingReason && { routing: { model: requestedModel, reason: routingReason } }),
      content: result.content,
      usage: {
        inputTokens: result.usage?.inputTokens || 0,
        outputTokens: result.usage?.outputTokens || 0,
        cost: '$0.00 — funded by $INFINITE treasury'
      },
      rateLimit: {
        remaining: tierConfig.dailyLimit - newUsage.count,
        limit: tierConfig.dailyLimit
      }
    });

  } catch (err) {
    logger.error('Proxy error', { model: requestedModel, err: err.message, apiKey: apiKey.slice(0, 8) });
    captureError(err, { model: requestedModel, apiKey: apiKey.slice(0, 8) });
    res.status(502).json({
      error: 'upstream_error',
      message: 'AI provider returned an error. Try again.',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// POST /v1/chat/stream — SSE streaming proxy
router.post('/chat/stream', authenticateApiKey, async (req, res) => {
  const { model, messages, max_tokens, temperature, tools, images } = req.body;
  const { tierConfig, usage, apiKey } = req.infinite;

  let requestedModel = model || tierConfig.models[0];
  let routingReason = null;

  const availableModels = tierConfig.models.filter(m => m !== 'auto');
  if (requestedModel === 'auto') {
    const routing = detectOptimalModel(messages, availableModels);
    requestedModel = routing.model;
    routingReason = routing.reason;
  }

  if (!availableModels.includes(requestedModel)) {
    return res.status(403).json({
      error: 'model_not_available',
      message: `${requestedModel} is not available on your ${tierConfig.label} tier.`,
      availableModels
    });
  }

  if (!isModelAvailable(requestedModel)) {
    return res.status(503).json({
      error: 'model_coming_soon',
      message: `${requestedModel} is coming soon. Stay tuned.`,
      availableModels: availableModels.filter(isModelAvailable),
    });
  }

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'invalid_request', message: 'messages array is required' });
  }

  const provider = getProviderForModel(requestedModel);
  const { native: translatedTools, serverTools } = translateToolsForProvider(provider, tools);
  const processedMessages = injectImagesIntoMessages(provider, messages, images);
  const systemPrompt = getSystemPromptWithContext(tierConfig, req.infinite.tier);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Emit routing info if auto-routed
  if (routingReason) {
    res.write(`data: ${JSON.stringify({ type: 'routing', model: requestedModel, reason: routingReason })}\n\n`);
  }

  const abortController = new AbortController();
  const { signal } = abortController;
  let clientDisconnected = false;

  res.on('close', () => {
    clientDisconnected = true;
    abortController.abort();
  });

  try {
    if (provider === 'claude') {
      await streamAnthropic(requestedModel, processedMessages, max_tokens || 4096, temperature, res, translatedTools, serverTools, apiKey, systemPrompt, signal);
    } else if (provider === 'gemini') {
      await streamGemini(requestedModel, processedMessages, max_tokens || 4096, temperature, res, translatedTools, serverTools, apiKey, systemPrompt, signal);
    } else if (provider === 'openai') {
      await streamOpenAI(requestedModel, processedMessages, max_tokens || 4096, temperature, res, translatedTools, serverTools, apiKey, systemPrompt, signal);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: `Unknown model: ${requestedModel}` })}\n\n`);
    }

    await incrementUsage(apiKey);
    if (!clientDisconnected) {
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    }
  } catch (err) {
    if (clientDisconnected || err.name === 'AbortError') return;
    logger.error('Stream error', { model: requestedModel, err: err.message, apiKey: apiKey.slice(0, 8) });
    captureError(err, { model: requestedModel, apiKey: apiKey.slice(0, 8), stream: true });
    if (!res.writableEnded) {
      const safeMsg = process.env.NODE_ENV === 'development' ? err.message : 'An error occurred processing your request.';
      res.write(`data: ${JSON.stringify({ type: 'error', message: safeMsg })}\n\n`);
      res.end();
    }
  }
});

export default router;
