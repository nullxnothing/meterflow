import { Router } from 'express';
import crypto from 'crypto';
import { authenticateApiKey } from '../middleware.js';
import { incrementUsage } from '../lib/helpers.js';
import { isModelAvailable, getProviderForModel } from '../lib/providers.js';
import { completeMeteredRequest } from '../lib/control-plane.js';
import { proxyAnthropic } from '../providers/anthropic.js';
import { proxyGemini } from '../providers/gemini.js';
import { proxyOpenAI } from '../providers/openai.js';

const router = Router();

const DEFAULT_MULTI_MODELS = ['claude-sonnet-4-6', 'gemini-2.5-flash'];

const PROXY_FNS = { claude: proxyAnthropic, gemini: proxyGemini, openai: proxyOpenAI };

function getProxyFn(model) {
  const provider = getProviderForModel(model);
  return provider ? PROXY_FNS[provider] : null;
}

// POST /v1/multi — Fan-out to multiple models in parallel, return all responses
router.post('/multi', authenticateApiKey, async (req, res) => {
  const startedAt = Date.now();
  const { models, messages, max_tokens, temperature } = req.body;
  const { tierConfig, apiKey } = req.meterflow;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'invalid_request', message: 'messages array is required' });
  }

  const requestedModels = models && Array.isArray(models) && models.length > 0
    ? models
    : DEFAULT_MULTI_MODELS;

  if (requestedModels.length > 4) {
    return res.status(400).json({ error: 'too_many_models', message: 'Maximum 4 models per multi request.' });
  }

  // Validate all models are available on this tier
  const unavailable = requestedModels.filter(m => !tierConfig.models.includes(m));
  if (unavailable.length > 0) {
    return res.status(403).json({
      error: 'model_not_available',
      message: `Models not available on your ${tierConfig.label} tier: ${unavailable.join(', ')}`,
      availableModels: tierConfig.models,
    });
  }

  const offline = requestedModels.filter(m => !isModelAvailable(m));
  if (offline.length > 0) {
    return res.status(503).json({
      error: 'model_coming_soon',
      message: `Models currently unavailable: ${offline.join(', ')}`,
      availableModels: tierConfig.models.filter(isModelAvailable),
    });
  }

  const maxTok = max_tokens || 1024;

  // Fan-out: call all models in parallel
  const settled = await Promise.allSettled(
    requestedModels.map(async (model) => {
      const proxyFn = getProxyFn(model);
      if (!proxyFn) throw new Error(`Unknown model: ${model}`);
      const result = await proxyFn(model, messages, maxTok, temperature);
      return { model, ...result };
    })
  );

  const responses = [];
  let totalTokens = 0;

  for (const entry of settled) {
    if (entry.status === 'fulfilled') {
      const { model, content, usage } = entry.value;
      totalTokens += usage?.totalTokens || 0;
      responses.push({
        model,
        content,
        usage: {
          inputTokens: usage?.inputTokens || 0,
          outputTokens: usage?.outputTokens || 0,
        },
      });
    } else {
      const model = requestedModels[settled.indexOf(entry)];
      responses.push({
        model,
        error: entry.reason?.message || 'Provider error',
        content: null,
      });
    }
  }

  await Promise.all([
    incrementUsage(apiKey, totalTokens),
    completeMeteredRequest(req, {
      status: 'metered_key',
      responseStatus: 200,
      latencyMs: Date.now() - startedAt,
      tokens: totalTokens,
    }),
  ]);

  res.json({
    id: `mf-multi-${crypto.randomBytes(8).toString('hex')}`,
    type: 'multi',
    responses,
    usage: {
      totalTokens,
      cost: 'metered by Meterflow',
    },
  });
});

// POST /v1/multi/stream — SSE streaming from multiple models in parallel
router.post('/multi/stream', authenticateApiKey, async (req, res) => {
  const startedAt = Date.now();
  const { models, messages, max_tokens, temperature } = req.body;
  const { tierConfig, apiKey } = req.meterflow;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'invalid_request', message: 'messages array is required' });
  }

  const requestedModels = models && Array.isArray(models) && models.length > 0
    ? models
    : DEFAULT_MULTI_MODELS;

  if (requestedModels.length > 4) {
    return res.status(400).json({ error: 'too_many_models', message: 'Maximum 4 models per multi request.' });
  }

  const unavailable = requestedModels.filter(m => !tierConfig.models.includes(m));
  if (unavailable.length > 0) {
    return res.status(403).json({
      error: 'model_not_available',
      message: `Models not available on your ${tierConfig.label} tier: ${unavailable.join(', ')}`,
      availableModels: tierConfig.models,
    });
  }

  const offline = requestedModels.filter(m => !isModelAvailable(m));
  if (offline.length > 0) {
    return res.status(503).json({
      error: 'model_coming_soon',
      message: `Models currently unavailable: ${offline.join(', ')}`,
      availableModels: tierConfig.models.filter(isModelAvailable),
    });
  }

  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const abortController = new AbortController();
  let clientDisconnected = false;

  res.on('close', () => {
    clientDisconnected = true;
    abortController.abort();
  });

  const maxTok = max_tokens || 1024;
  const write = (data) => {
    if (!clientDisconnected) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Stream each model in parallel, prefixing events with model name
  const streamPromises = requestedModels.map(async (model) => {
    const provider = getProviderForModel(model);

    if (!provider) {
      write({ type: 'error', model, message: `Unknown model: ${model}` });
      return;
    }

    write({ type: 'model_start', model });

    try {
      // Use non-streaming proxy for multi-stream to keep events clean
      // Each model's full response is streamed as chunks to the client
      const proxyFn = getProxyFn(model);
      const result = await proxyFn(model, messages, maxTok, temperature);

      const text = result.content?.[0]?.text
        || result.content?.map(c => c.text).join('')
        || '';

      write({
        type: 'model_result',
        model,
        content: text,
        usage: {
          inputTokens: result.usage?.inputTokens || 0,
          outputTokens: result.usage?.outputTokens || 0,
        },
      });
    } catch (err) {
      if (clientDisconnected || err.name === 'AbortError') return;
      write({ type: 'model_error', model, message: err.message });
    }
  });

  await Promise.allSettled(streamPromises);
  await Promise.all([
    incrementUsage(apiKey),
    completeMeteredRequest(req, {
      status: 'metered_key',
      responseStatus: 200,
      latencyMs: Date.now() - startedAt,
    }),
  ]);

  if (!clientDisconnected) {
    write({ type: 'done' });
    res.end();
  }
});

export default router;
