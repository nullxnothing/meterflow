import { CONFIG } from '../config.js';
import { isServerTool, executeTool } from '../tools/index.js';
import { fetchWithRetry } from '../lib/retry.js';

const API_TIMEOUT = 30_000;
const STREAM_RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);
const STREAM_MAX_RETRIES = 2;
const STREAM_BASE_DELAY = 1000;

async function fetchStreamWithRetry(url, options, label) {
  let lastError;
  for (let attempt = 0; attempt <= STREAM_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || !STREAM_RETRYABLE.has(response.status)) return response;

      const errBody = await response.text();
      lastError = new Error(`${label} ${response.status}: ${errBody}`);

      if (attempt < STREAM_MAX_RETRIES) {
        const retryAfter = response.headers?.get?.('retry-after');
        const delay = retryAfter && parseInt(retryAfter, 10) > 0
          ? parseInt(retryAfter, 10) * 1000
          : STREAM_BASE_DELAY * Math.pow(2, attempt) * (response.status === 529 ? 1.5 : 1);
        await new Promise(r => setTimeout(r, delay));
      }
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError' || err.name === 'TimeoutError') throw err;
      if (attempt < STREAM_MAX_RETRIES) {
        await new Promise(r => setTimeout(r, STREAM_BASE_DELAY * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

async function proxyAnthropic(model, messages, maxTokens, temperature) {
  const response = await fetchWithRetry(() => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CONFIG.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: Math.min(maxTokens, 4096),
      temperature: temperature ?? 0.7,
      messages
    }),
    signal: AbortSignal.timeout(API_TIMEOUT),
  }), 'Anthropic');

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic ${response.status}: ${err}`);
  }

  const data = await response.json();
  return {
    content: data.content,
    usage: {
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
      totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
    }
  };
}

async function streamAnthropic(model, messages, maxTokens, temperature, res, tools, serverTools, apiKey, systemPrompt, signal) {
  const MAX_TOOL_LOOPS = 3;
  let loopMessages = [...messages];

  for (let loop = 0; loop <= MAX_TOOL_LOOPS; loop++) {
    const body = {
      model,
      max_tokens: Math.min(maxTokens, 8192),
      temperature: temperature ?? 0.7,
      messages: loopMessages,
      stream: true,
    };
    if (systemPrompt) body.system = systemPrompt;
    if (tools) body.tools = tools;

    const response = await fetchStreamWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
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
    let stopReason = null;
    const contentBlocks = [];
    let currentBlockIndex = -1;

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
              contentBlocks[currentBlockIndex] = { type: 'tool_use', id: block.id, name: block.name, input: '' };
              if (isServerTool(block.name)) {
                res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: block.name, query: '' })}\n\n`);
              }
            } else if (block.type === 'server_tool_use') {
              res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: 'web_search', query: '' })}\n\n`);
              contentBlocks[currentBlockIndex] = { type: 'server_tool_use' };
            } else if (block.type === 'web_search_tool_result') {
              const sources = (block.content || [])
                .filter(c => c.type === 'web_search_result')
                .slice(0, 6)
                .map(c => ({ title: c.title || '', url: c.url || '', snippet: c.encrypted_content ? '' : (c.page_content || '').slice(0, 120) }));
              res.write(`data: ${JSON.stringify({ type: 'tool_result', tool: 'web_search', sources })}\n\n`);
              contentBlocks[currentBlockIndex] = { type: 'web_search_tool_result' };
            } else if (block.type === 'text') {
              contentBlocks[currentBlockIndex] = { type: 'text', text: '' };
            }
          }

          if (event.type === 'content_block_delta') {
            if (event.delta?.type === 'text_delta') {
              res.write(`data: ${JSON.stringify({ type: 'text', content: event.delta.text })}\n\n`);
              if (contentBlocks[currentBlockIndex]?.type === 'text') {
                contentBlocks[currentBlockIndex].text += event.delta.text;
              }
            } else if (event.delta?.type === 'input_json_delta') {
              if (contentBlocks[currentBlockIndex]?.type === 'tool_use') {
                contentBlocks[currentBlockIndex].input += event.delta.partial_json || '';
              }
            }
          }

          if (event.type === 'message_delta') {
            stopReason = event.delta?.stop_reason || null;
          }
        } catch {}
      }
    }
    } finally {
      reader.releaseLock();
    }

    const toolUseBlocks = contentBlocks.filter(b => b?.type === 'tool_use' && isServerTool(b.name));

    if (stopReason !== 'tool_use' || toolUseBlocks.length === 0 || loop === MAX_TOOL_LOOPS) {
      break;
    }

    const assistantContent = contentBlocks
      .filter(b => b && (b.type === 'text' || b.type === 'tool_use'))
      .map(b => {
        if (b.type === 'text') return { type: 'text', text: b.text };
        if (b.type === 'tool_use') {
          let input = {};
          try { input = JSON.parse(b.input); } catch {}
          return { type: 'tool_use', id: b.id, name: b.name, input };
        }
        return null;
      })
      .filter(Boolean);

    const toolResults = [];
    for (const block of toolUseBlocks) {
      let input = {};
      try { input = JSON.parse(block.input); } catch {}
      const result = await executeTool(block.name, input, apiKey);
      res.write(`data: ${JSON.stringify({ type: 'tool_result', tool: block.name, data: result })}\n\n`);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    loopMessages = [
      ...loopMessages,
      { role: 'assistant', content: assistantContent },
      ...toolResults.map(tr => ({ role: 'user', content: [tr] })),
    ];
  }
}

async function streamAnthropicWithSystem(model, systemPrompt, messages, maxTokens, temperature, res) {
  const response = await fetchStreamWithRetry('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CONFIG.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      max_tokens: Math.min(maxTokens, 8192),
      temperature: temperature ?? 0.7,
      messages,
      stream: true,
    }),
  }, 'Anthropic');

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic ${response.status}: ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

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
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          res.write(`data: ${JSON.stringify({ type: 'text', content: event.delta.text })}\n\n`);
        }
      } catch {}
    }
  }
}

export { proxyAnthropic, streamAnthropic, streamAnthropicWithSystem };
