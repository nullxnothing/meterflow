// OpenAI-compatible endpoint for third-party clients (OpenClaw, SillyTavern, etc.)
import { Router } from 'express';
import crypto from 'crypto';
import { authenticateApiKey } from '../middleware.js';
import { incrementUsage, incrementModelStats } from '../lib/helpers.js';
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
  const { tierConfig, apiKey, isTrial } = req.meterflow;

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

  const startTime = Date.now();
  try {
    let result;
    if (requestedModel.startsWith('claude')) {
      // Convert OpenAI message format (tool roles, array content) to Anthropic format
      const anthropicMessages = convertMessagesForAnthropic(chatMessages);
      result = await proxyAnthropic(requestedModel, anthropicMessages, effectiveMaxTokens, temperature);
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

    const latencyMs = Date.now() - startTime;
    await Promise.all([
      incrementUsage(apiKey, result.usage?.totalTokens || 0),
      incrementModelStats(requestedModel, result.usage?.totalTokens || 0, latencyMs, false),
    ]);

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
    const latencyMs = Date.now() - startTime;
    logger.error('OpenAI-compat error', { model: requestedModel, err: err.message, apiKey: apiKey.slice(0, 8) });
    captureError(err, { model: requestedModel, apiKey: apiKey.slice(0, 8) });
    incrementModelStats(requestedModel, 0, latencyMs, true).catch(() => {});
    const msg = err.message || '';
    const safeMsg = msg.includes('429') ? 'Rate limited by upstream provider. Try again shortly.'
      : msg.includes('overloaded') || msg.includes('529') ? 'Provider is overloaded. Try again in a moment.'
      : msg.includes('API key not valid') ? 'AI provider API key is misconfigured. Contact support.'
      : msg.includes('INVALID_ARGUMENT') || msg.includes('invalid_request') ? 'Request format error — try starting a new session.'
      : 'Upstream provider error. Try again.';
    res.status(502).json({ error: { message: safeMsg, type: 'server_error' } });
  }
});

async function handleStream(req, res, model, messages, maxTokens, temperature, apiKey, tierConfig, requestId, systemMsg, tools, toolChoice) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const streamStart = Date.now();
  const abortController = new AbortController();
  let clientDisconnected = false;

        // Keepalive heartbeat - prevents platform proxies from killing idle SSE connections.
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
    const systemPrompt = systemMsg?.content || getSystemPromptWithContext(tierConfig, req.meterflow.tier);
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

    clearInterval(heartbeat);
    const streamLatency = Date.now() - streamStart;
    await Promise.all([
      incrementUsage(apiKey),
      incrementModelStats(model, 0, streamLatency, false),
    ]);

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
    clearInterval(heartbeat);
    if (clientDisconnected || err.name === 'AbortError') return;
    const streamLatency = Date.now() - streamStart;
    logger.error('OpenAI-compat stream error', { model, err: err.message, apiKey: apiKey.slice(0, 8) });
    captureError(err, { model, apiKey: apiKey.slice(0, 8), stream: true, endpoint: 'openai-compat' });
    incrementModelStats(model, 0, streamLatency, true).catch(() => {});
    if (!res.writableEnded) {
      const msg = err.message || '';
      const safeMsg = msg.includes('429') ? 'Rate limited by upstream provider. Try again shortly.'
        : msg.includes('overloaded') || msg.includes('529') ? 'Provider is overloaded. Try again in a moment.'
        : msg.includes('API key not valid') ? 'AI provider API key is misconfigured. Contact support.'
        : msg.includes('INVALID_ARGUMENT') ? 'Request format error — try starting a new session.'
        : 'Upstream provider error. Try again.';
      res.write(`data: ${JSON.stringify({ error: { message: safeMsg, type: 'server_error' } })}\n\n`);
      res.end();
    }
  }
}

// Adapter: convert internal SSE events to OpenAI chunk format
function createSSEAdapter(res, requestId, model) {
  return {
    write(chunk) {
      if (res.writableEnded) return;
      if (typeof chunk !== 'string' || !chunk.startsWith('data: ')) return;
      const jsonStr = chunk.slice(6).trim();
      if (!jsonStr) return;
      try {
        const event = JSON.parse(jsonStr);
        // Accept both { type: 'text', content } and { type: 'text', text }
        const text = event.type === 'text' ? (event.content || event.text) : null;
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
      } catch {
        // Malformed event — skip silently (non-critical: stream continues)
      }
    },
  };
}

// Normalize content to Anthropic block format (always array of content blocks)
function toAnthropicContent(content) {
  if (!content) return [];
  if (typeof content === 'string') return content ? [{ type: 'text', text: content }] : [];
  if (Array.isArray(content)) {
    return content.map(c => {
      if (typeof c === 'string') return { type: 'text', text: c };
      if (c.type === 'text') return { type: 'text', text: c.text || '' };
      return c; // pass through image_url etc.
    }).filter(c => c.type !== 'text' || c.text);
  }
  return [{ type: 'text', text: String(content) }];
}

// Convert OpenAI-format messages to Anthropic format for passthrough
// Handles: assistant tool_calls → tool_use blocks, tool role → tool_result blocks
function convertMessagesForAnthropic(messages) {
  const result = [];
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      const content = toAnthropicContent(msg.content);
      for (const tc of msg.tool_calls) {
        let input = {};
        try { input = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : (tc.function.arguments || {}); } catch {}
        content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
      }
      if (content.length) result.push({ role: 'assistant', content });
    } else if (msg.role === 'tool') {
      const text = typeof msg.content === 'string' ? msg.content
        : msg.content != null ? JSON.stringify(msg.content) : '';
      result.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.tool_call_id,
          content: text || 'No output',
        }],
      });
    } else if (msg.role === 'assistant') {
      const content = toAnthropicContent(msg.content);
      if (content.length) result.push({ role: 'assistant', content });
    } else if (msg.role === 'user') {
      const content = toAnthropicContent(msg.content);
      if (content.length) result.push({ role: 'user', content });
    }
    // system messages are handled separately — skip here
  }

  // Merge consecutive same-role messages (Anthropic requires alternating roles)
  const merged = [];
  for (const msg of result) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === msg.role) {
      const prevContent = Array.isArray(prev.content) ? prev.content : toAnthropicContent(prev.content);
      const msgContent = Array.isArray(msg.content) ? msg.content : toAnthropicContent(msg.content);
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
    await streamGeminiPassthrough(model, messagesWithSystem, maxTokens, temperature, res, tools, toolChoice, requestId, signal);
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
  // Convert OpenAI-format tools to Anthropic format (strip unsupported schema fields)
  const anthropicTools = tools
    .filter(t => t?.function)
    .map(t => ({
      name: t.function.name,
      description: t.function.description || '',
      input_schema: sanitizeSchemaForAnthropic(t.function.parameters || { type: 'object', properties: {} }),
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
      'anthropic-beta': 'web-search-2025-03-05',
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

// Gemini passthrough — full function calling support for client tools (OpenClaw)
async function streamGeminiPassthrough(model, messages, maxTokens, temperature, res, tools, toolChoice, requestId, signal) {
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  // Convert OpenAI-format messages to Gemini contents with function call/response support
  const geminiContents = convertMessagesForGemini(chatMessages);

  // Convert OpenAI-format tools to Gemini functionDeclarations
  const geminiTools = convertToolsForGemini(tools);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${CONFIG.GOOGLE_API_KEY}`;

  const body = {
    contents: geminiContents,
    generationConfig: {
      maxOutputTokens: Math.min(maxTokens, 8192),
      temperature: temperature ?? 0.7,
    },
  };
  if (systemMsg) body.system_instruction = { parts: [{ text: systemMsg.content }] };
  if (geminiTools) body.tools = geminiTools;
  if (toolChoice) {
    if (toolChoice === 'none') body.tool_config = { function_calling_config: { mode: 'NONE' } };
    else if (toolChoice === 'required') body.tool_config = { function_calling_config: { mode: 'ANY' } };
    else body.tool_config = { function_calling_config: { mode: 'AUTO' } };
  }

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
  let toolCallIndex = -1;
  let hasFunctionCalls = false;

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
          const parts = data?.candidates?.[0]?.content?.parts || [];

          for (const part of parts) {
            if (part.text) {
              const oaiChunk = {
                id: requestId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{
                  index: 0,
                  delta: { content: part.text },
                  finish_reason: null,
                }],
              };
              res.write(`data: ${JSON.stringify(oaiChunk)}\n\n`);
            }

            if (part.functionCall) {
              hasFunctionCalls = true;
              toolCallIndex++;
              const callId = `call_${crypto.randomBytes(12).toString('hex')}`;
              const args = JSON.stringify(part.functionCall.args || {});

              // Emit tool_call start with full arguments (Gemini sends them in one shot)
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
                      id: callId,
                      type: 'function',
                      function: { name: part.functionCall.name, arguments: args },
                    }],
                  },
                  finish_reason: null,
                }],
              };
              res.write(`data: ${JSON.stringify(oaiChunk)}\n\n`);
            }
          }
        } catch {}
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Emit proper termination with correct finish_reason
  const finishReason = hasFunctionCalls ? 'tool_calls' : 'stop';
  const finalChunk = {
    id: requestId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
  };
  res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
  res.write('data: [DONE]\n\n');
}

// Convert OpenAI-format tools to Gemini functionDeclarations
function convertToolsForGemini(tools) {
  if (!tools || !Array.isArray(tools) || tools.length === 0) return undefined;

  const declarations = tools
    .filter(t => t?.function)
    .map(t => {
      const decl = {
        name: t.function.name,
        description: t.function.description || '',
      };
      if (t.function.parameters) {
        decl.parameters = sanitizeSchemaForGemini(t.function.parameters);
      }
      return decl;
    });

  return declarations.length > 0 ? [{ functionDeclarations: declarations }] : undefined;
}

// JSON Schema fields that Gemini's API does not support
const UNSUPPORTED_SCHEMA_FIELDS = [
  'additionalProperties', '$schema', 'default', 'patternProperties',
  '$ref', 'oneOf', 'anyOf', 'allOf', 'not', 'if', 'then', 'else',
  'const', 'examples', '$id', '$comment', 'definitions', '$defs',
  'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
  'multipleOf', 'pattern', 'title',
];

// Strip unsupported JSON Schema properties that Gemini rejects
function sanitizeSchemaForGemini(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(sanitizeSchemaForGemini);
  const cleaned = { ...schema };
  for (const field of UNSUPPORTED_SCHEMA_FIELDS) delete cleaned[field];

  if (cleaned.properties) {
    const props = {};
    for (const [key, val] of Object.entries(cleaned.properties)) {
      props[key] = sanitizeSchemaForGemini(val);
    }
    cleaned.properties = props;
  }
  if (cleaned.items) {
    cleaned.items = sanitizeSchemaForGemini(cleaned.items);
  }
  return cleaned;
}

// JSON Schema fields that Anthropic's API does not support
const UNSUPPORTED_ANTHROPIC_FIELDS = [
  '$schema', '$ref', '$id', '$comment', '$defs', 'definitions',
  'patternProperties', 'oneOf', 'anyOf', 'allOf', 'not',
  'if', 'then', 'else', 'examples', 'deprecated', 'readOnly', 'writeOnly',
  'const', 'default',
];

// Strip unsupported JSON Schema properties for Anthropic
function sanitizeSchemaForAnthropic(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(sanitizeSchemaForAnthropic);
  const cleaned = { ...schema };
  for (const field of UNSUPPORTED_ANTHROPIC_FIELDS) delete cleaned[field];

  if (cleaned.properties) {
    const props = {};
    for (const [key, val] of Object.entries(cleaned.properties)) {
      props[key] = sanitizeSchemaForAnthropic(val);
    }
    cleaned.properties = props;
  }
  if (cleaned.items) {
    cleaned.items = sanitizeSchemaForAnthropic(cleaned.items);
  }
  return cleaned;
}

// Safely extract text from OpenAI content (string, array, or object)
function extractTextContent(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(c => c.text || '').join('');
  return String(content);
}

// Convert OpenAI-format messages to Gemini contents with function call/response support
function convertMessagesForGemini(messages) {
  // Build a map of tool_call id → function name for correlating tool results
  const toolCallNames = new Map();
  for (const msg of messages) {
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.id && tc.function?.name) toolCallNames.set(tc.id, tc.function.name);
      }
    }
  }

  const contents = [];

  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      // Assistant with tool_calls → model role with functionCall parts
      const parts = [];
      const text = extractTextContent(msg.content);
      if (text) parts.push({ text });
      for (const tc of msg.tool_calls) {
        let args = {};
        try { args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : (tc.function.arguments || {}); } catch {}
        if (typeof args !== 'object' || args === null) args = {};
        parts.push({ functionCall: { name: tc.function.name, args } });
      }
      if (parts.length) contents.push({ role: 'model', parts });
    } else if (msg.role === 'tool') {
      // Tool result → user role with functionResponse part
      // Resolve function name from tool_call_id since OpenAI format uses tool_call_id, not name
      const fnName = msg.name || toolCallNames.get(msg.tool_call_id) || 'unknown';
      let responseData;
      try {
        responseData = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
      } catch {
        responseData = { result: msg.content || '' };
      }
      if (responseData == null) responseData = { result: '' };
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: fnName, response: responseData } }],
      });
    } else if (msg.role === 'assistant') {
      const text = extractTextContent(msg.content);
      if (text) contents.push({ role: 'model', parts: [{ text }] });
    } else if (msg.role === 'user') {
      const text = extractTextContent(msg.content);
      if (text) contents.push({ role: 'user', parts: [{ text }] });
    }
    // system messages handled separately — skip
  }

  // Merge consecutive same-role messages (Gemini requires alternating roles)
  const merged = [];
  for (const entry of contents) {
    const prev = merged[merged.length - 1];
    if (prev?.role === entry.role) {
      prev.parts = [...prev.parts, ...entry.parts];
    } else {
      merged.push(entry);
    }
  }

  // Guard: Gemini requires at least one content entry
  if (merged.length === 0) {
    merged.push({ role: 'user', parts: [{ text: 'Hello' }] });
  }

  return merged;
}

export default router;

// Exported for testing
export {
  extractTextContent,
  toAnthropicContent,
  convertMessagesForAnthropic,
  convertMessagesForGemini,
  sanitizeSchemaForGemini,
  sanitizeSchemaForAnthropic,
  convertToolsForGemini,
  hasClientTools,
  extractServerToolNames,
};
