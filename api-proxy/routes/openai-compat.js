// OpenAI-compatible endpoint for third-party clients (OpenClaw, SillyTavern, etc.)
import { Router } from 'express';
import crypto from 'crypto';
import { authenticateApiKey } from '../middleware.js';
import { incrementUsage } from '../lib/helpers.js';
import { logger } from '../lib/logger.js';
import { captureError } from '../lib/sentry.js';
import { getProviderForModel, isModelAvailable } from '../lib/providers.js';
import { getSystemPromptWithContext } from '../lib/system-prompt.js';
import { proxyAnthropic, streamAnthropic } from '../providers/anthropic.js';
import { proxyGemini, streamGemini } from '../providers/gemini.js';
import { proxyOpenAI, streamOpenAI } from '../providers/openai.js';
import { CONFIG } from '../config.js';

const router = Router();

const ALL_MODELS = [
  { id: 'claude-sonnet-4-6', owned_by: 'anthropic' },
  { id: 'claude-opus-4-6', owned_by: 'anthropic' },
  { id: 'gemini-2.5-pro', owned_by: 'google' },
  { id: 'gemini-2.5-flash', owned_by: 'google' },
  { id: 'gpt-4o', owned_by: 'openai' },
  { id: 'gpt-4o-mini', owned_by: 'openai' },
];

// GET /v1/models — model discovery (no auth required for endpoint detection)
router.get('/models', (req, res) => {
  const models = ALL_MODELS.map(m => ({
    id: m.id,
    object: 'model',
    created: 1700000000,
    owned_by: m.owned_by,
  }));
  res.json({ object: 'list', data: models });
});

// OpenAI-format auth wrapper — returns errors in { error: { message, type } } format
function oaiAuth(req, res, next) {
  const origJson = res.json.bind(res);
  res.json = function(body) {
    // Convert flat error strings from middleware to OpenAI nested format
    if (body?.error && typeof body.error === 'string') {
      return origJson({ error: { message: body.message || body.error, type: 'invalid_request_error', code: body.error } });
    }
    return origJson(body);
  };
  authenticateApiKey(req, res, next);
}

// POST /v1/chat/completions — OpenAI-compatible chat endpoint
router.post('/chat/completions', oaiAuth, async (req, res) => {
  const { model, messages, max_tokens, temperature, stream } = req.body;
  const { tierConfig, apiKey, isTrial } = req.infinite;

  const requestedModel = model || tierConfig.models.find(m => m !== 'auto') || 'gemini-2.5-flash';
  const availableModels = tierConfig.models.filter(m => m !== 'auto');

  if (!availableModels.includes(requestedModel)) {
    return res.status(403).json({
      error: { message: `Model ${requestedModel} is not available on your ${tierConfig.label} tier.`, type: 'invalid_request_error' },
    });
  }

  if (!isModelAvailable(requestedModel)) {
    return res.status(503).json({
      error: { message: `${requestedModel} is currently unavailable.`, type: 'server_error' },
    });
  }

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({
      error: { message: 'messages array is required', type: 'invalid_request_error' },
    });
  }

  const systemMsg = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');
  const effectiveMaxTokens = isTrial ? Math.min(max_tokens || 2048, 2048) : (max_tokens || 4096);
  const requestId = `chatcmpl-${crypto.randomBytes(12).toString('hex')}`;

  if (stream) {
    return handleStream(req, res, requestedModel, chatMessages, effectiveMaxTokens, temperature, apiKey, tierConfig, requestId, systemMsg);
  }

  try {
    let result;
    if (requestedModel.startsWith('claude')) {
      result = await proxyAnthropic(requestedModel, chatMessages, effectiveMaxTokens, temperature);
    } else if (requestedModel.startsWith('gemini')) {
      result = await proxyGemini(requestedModel, chatMessages, effectiveMaxTokens, temperature);
    } else if (requestedModel.startsWith('gpt-')) {
      result = await proxyOpenAI(requestedModel, chatMessages, effectiveMaxTokens, temperature);
    } else {
      return res.status(400).json({ error: { message: `Unknown model: ${requestedModel}`, type: 'invalid_request_error' } });
    }

    const text = Array.isArray(result.content)
      ? result.content.map(c => c.text || '').join('')
      : (typeof result.content === 'string' ? result.content : '');

    await incrementUsage(apiKey, result.usage?.totalTokens || 0);

    res.json({
      id: requestId,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: requestedModel,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: result.usage?.inputTokens || 0,
        completion_tokens: result.usage?.outputTokens || 0,
        total_tokens: result.usage?.totalTokens || 0,
      },
    });
  } catch (err) {
    logger.error('OpenAI-compat error', { model: requestedModel, err: err.message, apiKey: apiKey.slice(0, 8) });
    captureError(err, { model: requestedModel, apiKey: apiKey.slice(0, 8) });
    res.status(502).json({ error: { message: 'Upstream provider error. Try again.', type: 'server_error' } });
  }
});

async function handleStream(req, res, model, messages, maxTokens, temperature, apiKey, tierConfig, requestId, systemMsg) {
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

  // Adapter: convert internal SSE format to OpenAI SSE format
  const fakeRes = {
    write(chunk) {
      if (clientDisconnected) return;
      if (!chunk.startsWith('data: ')) return;
      const jsonStr = chunk.slice(6).trim();
      if (!jsonStr) return;
      try {
        const event = JSON.parse(jsonStr);
        if (event.type === 'text' && event.content) {
          const oaiChunk = {
            id: requestId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{
              index: 0,
              delta: { content: event.content },
              finish_reason: null,
            }],
          };
          res.write(`data: ${JSON.stringify(oaiChunk)}\n\n`);
        }
      } catch {}
    },
  };

  try {
    const systemPrompt = systemMsg?.content || getSystemPromptWithContext(tierConfig, req.infinite.tier);
    const provider = getProviderForModel(model);

    if (provider === 'claude') {
      await streamAnthropic(model, messages, maxTokens, temperature, fakeRes, null, [], apiKey, systemPrompt, abortController.signal);
    } else if (provider === 'gemini') {
      await streamGemini(model, messages, maxTokens, temperature, fakeRes, null, [], apiKey, systemPrompt, abortController.signal);
    } else if (provider === 'openai') {
      await streamOpenAI(model, messages, maxTokens, temperature, fakeRes, null, [], apiKey, systemPrompt, abortController.signal);
    }

    await incrementUsage(apiKey);

    if (!clientDisconnected) {
      const finalChunk = {
        id: requestId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      };
      res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (err) {
    if (clientDisconnected || err.name === 'AbortError') return;
    logger.error('OpenAI-compat stream error', { model, err: err.message, apiKey: apiKey.slice(0, 8) });
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: { message: 'Stream error', type: 'server_error' } })}\n\n`);
      res.end();
    }
  }
}

export default router;
