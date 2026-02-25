// OpenAI-compatible endpoint for third-party clients (OpenClaw, SillyTavern, etc.)
import { Router } from 'express';
import crypto from 'crypto';
import { authenticateApiKey } from '../middleware.js';
import { incrementUsage } from '../lib/helpers.js';
import { logger } from '../lib/logger.js';
import { captureError } from '../lib/sentry.js';
import { getProviderForModel, isModelAvailable, translateToolsForProvider } from '../lib/providers.js';
import { getSystemPromptWithContext } from '../lib/system-prompt.js';
import { SERVER_TOOL_NAMES } from '../tools/index.js';
import { proxyAnthropic, streamAnthropic } from '../providers/anthropic.js';
import { proxyGemini, streamGemini } from '../providers/gemini.js';
import { proxyOpenAI, streamOpenAI } from '../providers/openai.js';
import { CONFIG } from '../config.js';
import { fetchStreamWithRetry } from '../lib/retry.js';

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

// Check if client is sending its own tool definitions (e.g. OpenClaw agent tools)
// vs requesting our server-side tools by name
function hasClientTools(tools) {
  if (!tools || !Array.isArray(tools) || tools.length === 0) return false;
  return tools.some(t => typeof t === 'object' && t?.function?.name && !SERVER_TOOL_NAMES.includes(t.function.name));
}

// Extract only our server tool names from a mixed tools array
function extractServerToolNames(tools) {
  if (!tools || !Array.isArray(tools)) return undefined;
  const names = tools
    .map(t => typeof t === 'string' ? t : t?.function?.name)
    .filter(name => name && (SERVER_TOOL_NAMES.includes(name) || name === 'web_search'));
  return names.length > 0 ? names : undefined;
}

// POST /v1/chat/completions — OpenAI-compatible chat endpoint
router.post('/chat/completions', oaiAuth, async (req, res) => {
  const { model, messages, max_tokens, temperature, stream, tools, tool_choice } = req.body;
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
  const effectiveTools = isTrial ? undefined : tools;
  const requestId = `chatcmpl-${crypto.randomBytes(12).toString('hex')}`;

  if (stream) {
    return handleStream(req, res, requestedModel, chatMessages, effectiveMaxTokens, temperature, apiKey, tierConfig, requestId, systemMsg, effectiveTools, tool_choice);
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

async function handleStream(req, res, model, messages, maxTokens, temperature, apiKey, tierConfig, requestId, systemMsg, tools, toolChoice) {
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

  try {
    const systemPrompt = systemMsg?.content || getSystemPromptWithContext(tierConfig, req.infinite.tier);
    const provider = getProviderForModel(model);

    let isPassthrough = false;

    // Client-defined tools (OpenClaw, etc.) → transparent proxy passthrough
    // The model sees the tools, returns tool_calls, client executes them locally
    if (hasClientTools(tools)) {
      isPassthrough = true;
      await streamPassthrough(provider, model, messages, maxTokens, temperature, res, tools, toolChoice, systemPrompt, requestId, abortController.signal);
    } else {
      // No client tools or only our server tools → use internal tool execution
      const serverToolNames = extractServerToolNames(tools);
      const { native: translatedTools, serverTools } = translateToolsForProvider(provider, serverToolNames);

      const fakeRes = createSSEAdapter(res, requestId, model);

      if (provider === 'claude') {
        await streamAnthropic(model, messages, maxTokens, temperature, fakeRes, translatedTools, serverTools, apiKey, systemPrompt, abortController.signal);
      } else if (provider === 'gemini') {
        await streamGemini(model, messages, maxTokens, temperature, fakeRes, translatedTools, serverTools, apiKey, systemPrompt, abortController.signal);
      } else if (provider === 'openai') {
        await streamOpenAI(model, messages, maxTokens, temperature, fakeRes, translatedTools, serverTools, apiKey, systemPrompt, abortController.signal);
      }
    }

    await incrementUsage(apiKey);

    if (!clientDisconnected && !res.writableEnded) {
      // Passthrough streams already include [DONE] from upstream
      if (!isPassthrough) {
        const finalChunk = {
          id: requestId,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        };
        res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
        res.write('data: [DONE]\n\n');
      }
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

// Adapter: convert internal SSE events to OpenAI chunk format (text only)
function createSSEAdapter(res, requestId, model) {
  return {
    write(chunk) {
      if (res.writableEnded) return;
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
}

// Convert OpenAI-format messages to Anthropic format for passthrough
// Handles: assistant tool_calls → tool_use blocks, tool role → tool_result blocks
function convertMessagesForAnthropic(messages) {
  const result = [];
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      const content = [];
      if (msg.content) content.push({ type: 'text', text: msg.content });
      for (const tc of msg.tool_calls) {
        let input = {};
        try { input = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments; } catch {}
        content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
      }
      result.push({ role: 'assistant', content });
    } else if (msg.role === 'tool') {
      result.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.tool_call_id,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        }],
      });
    } else {
      result.push(msg);
    }
  }

  // Merge consecutive user messages (Anthropic requires alternating roles)
  const merged = [];
  for (const msg of result) {
    const prev = merged[merged.length - 1];
    if (prev?.role === 'user' && msg.role === 'user') {
      const prevContent = Array.isArray(prev.content) ? prev.content : [{ type: 'text', text: prev.content }];
      const msgContent = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content }];
      prev.content = [...prevContent, ...msgContent];
    } else {
      merged.push(msg);
    }
  }
  return merged;
}

// Transparent proxy: stream directly from upstream provider in OpenAI format
// Used when clients (OpenClaw) send their own tool definitions
async function streamPassthrough(provider, model, messages, maxTokens, temperature, res, tools, toolChoice, systemPrompt, requestId, signal) {
  const messagesWithSystem = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  if (provider === 'openai') {
    await streamOpenAIPassthrough(model, messagesWithSystem, maxTokens, temperature, res, tools, toolChoice, requestId, signal);
  } else if (provider === 'claude') {
    await streamAnthropicPassthrough(model, messages, maxTokens, temperature, res, tools, toolChoice, systemPrompt, requestId, signal);
  } else if (provider === 'gemini') {
    // Gemini doesn't natively support OpenAI-format tool_calls, fall back to text-only
    await streamGeminiPassthrough(model, messagesWithSystem, maxTokens, temperature, res, requestId, signal);
  }
}

// OpenAI passthrough — direct proxy, preserving tool_calls in the stream
async function streamOpenAIPassthrough(model, messages, maxTokens, temperature, res, tools, toolChoice, requestId, signal) {
  const body = {
    model,
    max_tokens: Math.min(maxTokens, 8192),
    temperature: temperature ?? 0.7,
    messages,
    stream: true,
  };
  if (tools?.length > 0) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;

  const response = await fetchStreamWithRetry('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal,
  }, 'OpenAI');

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI ${response.status}: ${err}`);
  }

  // Stream OpenAI chunks directly to client — they're already in the right format
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          res.write(line + '\n\n');
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// Anthropic passthrough — convert Claude tool_use to OpenAI tool_calls format
async function streamAnthropicPassthrough(model, messages, maxTokens, temperature, res, tools, toolChoice, systemPrompt, requestId, signal) {
  // Convert OpenAI-format tools to Anthropic format
  const anthropicTools = tools
    .filter(t => t?.function)
    .map(t => ({
      name: t.function.name,
      description: t.function.description || '',
      input_schema: t.function.parameters || { type: 'object', properties: {} },
    }));

  // Convert OpenAI-format messages to Anthropic format
  // Handle tool_calls in assistant messages and tool role messages
  const anthropicMessages = convertMessagesForAnthropic(messages);

  const body = {
    model,
    max_tokens: Math.min(maxTokens, 8192),
    temperature: temperature ?? 0.7,
    messages: anthropicMessages,
    stream: true,
  };
  if (systemPrompt) body.system = systemPrompt;
  if (anthropicTools.length > 0) body.tools = anthropicTools;
  if (toolChoice === 'auto') body.tool_choice = { type: 'auto' };
  else if (toolChoice === 'none') body.tool_choice = { type: 'none' };
  else if (toolChoice === 'required') body.tool_choice = { type: 'any' };

  const response = await fetchStreamWithRetry('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CONFIG.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal,
  }, 'Anthropic');

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic ${response.status}: ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const contentBlocks = [];
  let currentBlockIndex = -1;
  let toolCallIndex = -1;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const event = JSON.parse(jsonStr);

          if (event.type === 'content_block_start') {
            currentBlockIndex = event.index ?? contentBlocks.length;
            const block = event.content_block || {};

            if (block.type === 'tool_use') {
              toolCallIndex++;
              contentBlocks[currentBlockIndex] = { type: 'tool_use', id: block.id, name: block.name, input: '' };
              // Emit tool_call start chunk
              const oaiChunk = {
                id: requestId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{
                  index: 0,
                  delta: {
                    tool_calls: [{
                      index: toolCallIndex,
                      id: block.id,
                      type: 'function',
                      function: { name: block.name, arguments: '' },
                    }],
                  },
                  finish_reason: null,
                }],
              };
              res.write(`data: ${JSON.stringify(oaiChunk)}\n\n`);
            } else if (block.type === 'text') {
              contentBlocks[currentBlockIndex] = { type: 'text' };
            }
          }

          if (event.type === 'content_block_delta') {
            if (event.delta?.type === 'text_delta') {
              const oaiChunk = {
                id: requestId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{
                  index: 0,
                  delta: { content: event.delta.text },
                  finish_reason: null,
                }],
              };
              res.write(`data: ${JSON.stringify(oaiChunk)}\n\n`);
            } else if (event.delta?.type === 'input_json_delta') {
              // Stream tool call arguments
              const currentBlock = contentBlocks[currentBlockIndex];
              if (currentBlock?.type === 'tool_use') {
                const oaiChunk = {
                  id: requestId,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [{
                    index: 0,
                    delta: {
                      tool_calls: [{
                        index: toolCallIndex,
                        function: { arguments: event.delta.partial_json || '' },
                      }],
                    },
                    finish_reason: null,
                  }],
                };
                res.write(`data: ${JSON.stringify(oaiChunk)}\n\n`);
              }
            }
          }

          if (event.type === 'message_delta') {
            const stopReason = event.delta?.stop_reason;
            if (stopReason) {
              const finishReason = stopReason === 'tool_use' ? 'tool_calls' : 'stop';
              const oaiChunk = {
                id: requestId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
              };
              res.write(`data: ${JSON.stringify(oaiChunk)}\n\n`);
              res.write('data: [DONE]\n\n');
            }
          }
        } catch {}
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// Gemini passthrough — text only (no tool_calls support for client tools)
async function streamGeminiPassthrough(model, messages, maxTokens, temperature, res, requestId, signal) {
  // Extract system instruction and filter out system messages
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  const geminiContents = chatMessages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${CONFIG.GOOGLE_API_KEY}`;

  const body = {
    contents: geminiContents,
    generationConfig: {
      maxOutputTokens: Math.min(maxTokens, 8192),
      temperature: temperature ?? 0.7,
    },
  };
  if (systemMsg) body.system_instruction = { parts: [{ text: systemMsg.content }] };

  const response = await fetchStreamWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  }, 'Gemini');

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini ${response.status}: ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const data = JSON.parse(jsonStr);
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const oaiChunk = {
              id: requestId,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [{
                index: 0,
                delta: { content: text },
                finish_reason: null,
              }],
            };
            res.write(`data: ${JSON.stringify(oaiChunk)}\n\n`);
          }
        } catch {}
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Emit proper termination
  const finalChunk = {
    id: requestId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  };
  res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
  res.write('data: [DONE]\n\n');
}

export default router;
