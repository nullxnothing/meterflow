import { Router } from 'express';
import crypto from 'crypto';
import { authenticateApiKey } from '../middleware.js';
import { incrementUsage, incrementModelStats } from '../lib/helpers.js';
import { logger } from '../lib/logger.js';
import { captureError } from '../lib/sentry.js';
import { completeMeteredRequest } from '../lib/control-plane.js';
import { getProviderForModel, isModelAvailable, translateToolsForProvider, injectImagesIntoMessages } from '../lib/providers.js';
import { getSystemPromptWithContext } from '../lib/system-prompt.js';
import { detectOptimalModel } from '../lib/router.js';
import { proxyAnthropic, streamAnthropic } from '../providers/anthropic.js';
import { proxyGemini, streamGemini } from '../providers/gemini.js';
import { proxyOpenAI, streamOpenAI } from '../providers/openai.js';

const router = Router();

/**
 * Resolve and validate the requested model against tier + availability.
 * Returns { model, routingReason } on success, or sends an error response and returns null.
 */
function resolveModel(req, res, requestedModel, messages) {
  const { tierConfig } = req.meterflow;
  const availableModels = tierConfig.models.filter(m => m !== 'auto');
  let routingReason = null;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'invalid_request', message: 'messages array is required' });
    return null;
  }

  if (requestedModel === 'auto') {
    const routing = detectOptimalModel(messages, availableModels);
    requestedModel = routing.model;
    routingReason = routing.reason;
  }

  if (!availableModels.includes(requestedModel)) {
    res.status(403).json({
      error: 'model_not_available',
      message: `${requestedModel} is not available on your ${tierConfig.label} tier.`,
      availableModels,
    });
    return null;
  }

  if (!isModelAvailable(requestedModel)) {
    res.status(503).json({
      error: 'model_unavailable',
      message: `${requestedModel} is not configured for this Meterflow route.`,
      availableModels: availableModels.filter(isModelAvailable),
    });
    return null;
  }

  return { model: requestedModel, routingReason };
}

// POST /v1/chat — Proxy to Claude, Gemini, or OpenAI
router.post('/chat', authenticateApiKey, async (req, res) => {
  const { model, messages, max_tokens, temperature } = req.body;
  const { tierConfig, apiKey } = req.meterflow;

  const resolved = resolveModel(req, res, model || tierConfig.models[0], messages);
  if (!resolved) return;
  const { model: requestedModel, routingReason } = resolved;

  const chatStart = Date.now();
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

    const chatLatency = Date.now() - chatStart;
    const [newUsage] = await Promise.all([
      incrementUsage(apiKey, result.usage?.totalTokens || 0),
      incrementModelStats(requestedModel, result.usage?.totalTokens || 0, chatLatency, false),
      completeMeteredRequest(req, {
        status: 'metered_key',
        responseStatus: 200,
        latencyMs: chatLatency,
        tokens: result.usage?.totalTokens || 0,
      }),
    ]);

    res.json({
      id: `mf-${crypto.randomBytes(12).toString('hex')}`,
      model: requestedModel,
      ...(routingReason && { routing: { model: requestedModel, reason: routingReason } }),
      content: result.content,
      usage: {
        inputTokens: result.usage?.inputTokens || 0,
        outputTokens: result.usage?.outputTokens || 0,
        cost: 'metered by Meterflow'
      },
      rateLimit: {
        remaining: tierConfig.dailyLimit - newUsage.count,
        limit: tierConfig.dailyLimit
      },
    });

  } catch (err) {
    completeMeteredRequest(req, {
      status: 'upstream_error',
      responseStatus: 502,
      latencyMs: Date.now() - chatStart,
      error: err.message,
    }).catch(() => {});
    incrementModelStats(requestedModel, 0, Date.now() - chatStart, true).catch(() => {});
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
  const { tierConfig, apiKey, isTrial } = req.meterflow;

  const resolved = resolveModel(req, res, model || tierConfig.models[0], messages);
  if (!resolved) return;
  const { model: requestedModel, routingReason } = resolved;

  // Trial users: no tools, capped tokens
  const effectiveTools = isTrial ? undefined : tools;
  const effectiveMaxTokens = isTrial ? Math.min(max_tokens || 2048, 2048) : (max_tokens || 4096);

  const provider = getProviderForModel(requestedModel);
  const { native: translatedTools, serverTools } = translateToolsForProvider(provider, effectiveTools);
  const processedMessages = injectImagesIntoMessages(provider, messages, images);
  const systemPrompt = getSystemPromptWithContext(tierConfig, req.meterflow.tier);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Emit routing info if auto-routed
  if (routingReason) {
    res.write(`data: ${JSON.stringify({ type: 'routing', model: requestedModel, reason: routingReason })}\n\n`);
  }

  const streamStart = Date.now();
  const abortController = new AbortController();
  const { signal } = abortController;
  let clientDisconnected = false;

  // Keepalive heartbeat — prevents Render/Cloudflare from killing idle SSE connections
  const heartbeat = setInterval(() => {
    if (!clientDisconnected && !res.writableEnded) {
      res.write(': heartbeat\n\n');
    }
  }, 15_000);

  res.on('close', () => {
    clientDisconnected = true;
    clearInterval(heartbeat);
    abortController.abort();
  });

  try {
    if (provider === 'claude') {
      await streamAnthropic(requestedModel, processedMessages, effectiveMaxTokens, temperature, res, translatedTools, serverTools, apiKey, systemPrompt, signal);
    } else if (provider === 'gemini') {
      await streamGemini(requestedModel, processedMessages, effectiveMaxTokens, temperature, res, translatedTools, serverTools, apiKey, systemPrompt, signal);
    } else if (provider === 'openai') {
      await streamOpenAI(requestedModel, processedMessages, effectiveMaxTokens, temperature, res, translatedTools, serverTools, apiKey, systemPrompt, signal);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: `Unknown model: ${requestedModel}` })}\n\n`);
    }

    clearInterval(heartbeat);
    const [newUsage] = await Promise.all([
      incrementUsage(apiKey),
      incrementModelStats(requestedModel, 0, Date.now() - streamStart, false),
      completeMeteredRequest(req, {
        status: 'metered_key',
        responseStatus: 200,
        latencyMs: Date.now() - streamStart,
      }),
    ]);
    if (isTrial && !clientDisconnected) {
      res.write(`data: ${JSON.stringify({ type: 'trial', used: newUsage.count, limit: tierConfig.dailyLimit })}\n\n`);
    }
    if (!clientDisconnected) {
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    }
  } catch (err) {
    clearInterval(heartbeat);
    if (clientDisconnected || err.name === 'AbortError') return;
    completeMeteredRequest(req, {
      status: 'upstream_error',
      responseStatus: 502,
      latencyMs: Date.now() - streamStart,
      error: err.message,
    }).catch(() => {});
    incrementModelStats(requestedModel, 0, Date.now() - streamStart, true).catch(() => {});
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
