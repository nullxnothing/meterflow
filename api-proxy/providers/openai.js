import { CONFIG } from '../config.js';
import { isServerTool, executeTool } from '../tools/index.js';

async function proxyOpenAI(model, messages, maxTokens, temperature) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: Math.min(maxTokens, 4096),
      temperature: temperature ?? 0.7,
      messages,
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';

  return {
    content: [{ type: 'text', text }],
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    }
  };
}

async function streamOpenAI(model, messages, maxTokens, temperature, res, tools, serverTools, apiKey, systemPrompt) {
  const hasServerTools = serverTools && serverTools.length > 0;
  const hasNativeToolsOnly = tools && tools.length > 0 && !hasServerTools;

  // Inject system prompt as first message for OpenAI
  const messagesWithSystem = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  if (hasServerTools) {
    await streamOpenAIChatWithTools(model, messagesWithSystem, maxTokens, temperature, res, tools, serverTools, apiKey);
  } else if (hasNativeToolsOnly) {
    await streamOpenAIResponses(model, messagesWithSystem, maxTokens, temperature, res, tools);
  } else {
    await streamOpenAIChatCompletions(model, messagesWithSystem, maxTokens, temperature, res);
  }
}

async function streamOpenAIChatWithTools(model, messages, maxTokens, temperature, res, tools, serverTools, apiKey) {
  const MAX_TOOL_LOOPS = 3;
  const functionTools = tools.filter(t => t.type === 'function');

  let loopMessages = [...messages];

  for (let loop = 0; loop <= MAX_TOOL_LOOPS; loop++) {
    const body = {
      model,
      max_tokens: Math.min(maxTokens, 8192),
      temperature: temperature ?? 0.7,
      messages: loopMessages,
      stream: true,
    };
    if (functionTools.length > 0) body.tools = functionTools;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI ${response.status}: ${err}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finishReason = null;
    const toolCallAccumulator = {};
    let collectedText = '';

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
          const data = JSON.parse(jsonStr);
          const choice = data.choices?.[0];
          if (!choice) continue;

          if (choice.delta?.content) {
            collectedText += choice.delta.content;
            res.write(`data: ${JSON.stringify({ type: 'text', content: choice.delta.content })}\n\n`);
          }

          if (choice.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              const idx = tc.index;
              if (!toolCallAccumulator[idx]) {
                toolCallAccumulator[idx] = { id: tc.id || '', name: tc.function?.name || '', arguments: '' };
                if (tc.function?.name && isServerTool(tc.function.name)) {
                  res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: tc.function.name, query: '' })}\n\n`);
                }
              }
              if (tc.id) toolCallAccumulator[idx].id = tc.id;
              if (tc.function?.name) toolCallAccumulator[idx].name = tc.function.name;
              if (tc.function?.arguments) toolCallAccumulator[idx].arguments += tc.function.arguments;
            }
          }

          if (choice.finish_reason) finishReason = choice.finish_reason;
        } catch {}
      }
    }

    const toolCalls = Object.values(toolCallAccumulator).filter(tc => isServerTool(tc.name));

    if (finishReason !== 'tool_calls' || toolCalls.length === 0 || loop === MAX_TOOL_LOOPS) break;

    const assistantMsg = { role: 'assistant', content: collectedText || null, tool_calls: Object.values(toolCallAccumulator).map(tc => ({
      id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments },
    })) };

    const toolResultMsgs = [];
    for (const tc of toolCalls) {
      let args = {};
      try { args = JSON.parse(tc.arguments); } catch {}
      const result = await executeTool(tc.name, args, apiKey);
      res.write(`data: ${JSON.stringify({ type: 'tool_result', tool: tc.name, data: result })}\n\n`);
      toolResultMsgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }

    loopMessages = [...loopMessages, assistantMsg, ...toolResultMsgs];
  }
}

async function streamOpenAIChatCompletions(model, messages, maxTokens, temperature, res) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: Math.min(maxTokens, 8192),
      temperature: temperature ?? 0.7,
      messages,
      stream: true,
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI ${response.status}: ${err}`);
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
        const data = JSON.parse(jsonStr);
        const text = data.choices?.[0]?.delta?.content;
        if (text) {
          res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
        }
      } catch {}
    }
  }
}

async function streamOpenAIResponses(model, messages, maxTokens, temperature, res, tools) {
  const input = messages.map(m => ({ role: m.role, content: m.content }));

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_output_tokens: Math.min(maxTokens, 8192),
      temperature: temperature ?? 0.7,
      input,
      tools,
      stream: true,
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI ${response.status}: ${err}`);
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

        if (event.type === 'response.web_search_call.searching') {
          res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: 'web_search', query: '' })}\n\n`);
        }

        if (event.type === 'response.output_text.delta') {
          res.write(`data: ${JSON.stringify({ type: 'text', content: event.delta || '' })}\n\n`);
        }

        if (event.type === 'response.output_text.done') {
          const annotations = event.annotations || [];
          const urlCites = annotations.filter(a => a.type === 'url_citation');
          if (urlCites.length > 0) {
            const sources = urlCites.slice(0, 6).map(a => ({
              title: a.title || a.url || '',
              url: a.url || '',
              snippet: '',
            }));
            res.write(`data: ${JSON.stringify({ type: 'tool_result', tool: 'web_search', sources })}\n\n`);
          }
        }
      } catch {}
    }
  }
}

async function streamOpenAIWithSystem(model, systemPrompt, messages, maxTokens, temperature, res) {
  const openaiMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: Math.min(maxTokens, 8192),
      temperature: temperature ?? 0.7,
      messages: openaiMessages,
      stream: true,
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI ${response.status}: ${err}`);
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
        const data = JSON.parse(jsonStr);
        const text = data.choices?.[0]?.delta?.content;
        if (text) {
          res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
        }
      } catch {}
    }
  }
}

export { proxyOpenAI, streamOpenAI, streamOpenAIWithSystem };
