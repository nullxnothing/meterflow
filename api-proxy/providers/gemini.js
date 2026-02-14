import { CONFIG } from '../config.js';
import { isServerTool, executeTool } from '../tools/index.js';

async function proxyGemini(model, messages, maxTokens, temperature) {
  const geminiContents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: typeof m.content === 'string' ? m.content : m.content.map(c => c.text).join('') }]
  }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${CONFIG.GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: geminiContents,
        generationConfig: {
          maxOutputTokens: Math.min(maxTokens, 4096),
          temperature: temperature ?? 0.7
        }
      })
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return {
    content: [{ type: 'text', text }],
    usage: {
      inputTokens: data.usageMetadata?.promptTokenCount || 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: data.usageMetadata?.totalTokenCount || 0
    }
  };
}

async function streamGemini(model, messages, maxTokens, temperature, res, tools, serverTools, apiKey, systemPrompt) {
  const MAX_TOOL_LOOPS = 3;

  function buildGeminiContents(msgs) {
    return msgs.map(m => {
      const parts = [];
      if (m._images) {
        for (const img of m._images) {
          parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
        }
      }
      if (m._functionResponses) {
        for (const fr of m._functionResponses) {
          parts.push({ functionResponse: fr });
        }
        return { role: 'user', parts };
      }
      if (m._functionCalls) {
        for (const fc of m._functionCalls) {
          parts.push({ functionCall: fc });
        }
        return { role: 'model', parts };
      }
      const text = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.map(c => c.text || '').join('') : '');
      if (text) parts.push({ text });
      return { role: m.role === 'assistant' ? 'model' : 'user', parts };
    });
  }

  let loopMessages = [...messages];

  for (let loop = 0; loop <= MAX_TOOL_LOOPS; loop++) {
    const geminiContents = buildGeminiContents(loopMessages);

    const body = {
      contents: geminiContents,
      generationConfig: {
        maxOutputTokens: Math.min(maxTokens, 8192),
        temperature: temperature ?? 0.7,
      },
    };
    if (systemPrompt) body.system_instruction = { parts: [{ text: systemPrompt }] };
    if (tools) body.tools = tools;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${CONFIG.GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini ${response.status}: ${err}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let emittedGroundingStart = false;
    const functionCalls = [];

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
          const parts = data.candidates?.[0]?.content?.parts || [];

          for (const part of parts) {
            if (part.text) {
              res.write(`data: ${JSON.stringify({ type: 'text', content: part.text })}\n\n`);
            }
            if (part.functionCall && isServerTool(part.functionCall.name)) {
              res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: part.functionCall.name, query: '' })}\n\n`);
              functionCalls.push(part.functionCall);
            }
          }

          const grounding = data.candidates?.[0]?.groundingMetadata;
          if (grounding) {
            if (!emittedGroundingStart && grounding.searchEntryPoint) {
              const query = grounding.webSearchQueries?.[0] || '';
              res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: 'web_search', query })}\n\n`);
              emittedGroundingStart = true;
            }
            const chunks = grounding.groundingChunks || [];
            if (chunks.length > 0) {
              const sources = chunks.slice(0, 6).map(c => ({
                title: c.web?.title || '',
                url: c.web?.uri || '',
                snippet: '',
              }));
              res.write(`data: ${JSON.stringify({ type: 'tool_result', tool: 'web_search', sources })}\n\n`);
            }
          }
        } catch {}
      }
    }

    if (functionCalls.length === 0 || loop === MAX_TOOL_LOOPS) break;

    const functionResponses = [];
    for (const fc of functionCalls) {
      const result = await executeTool(fc.name, fc.args || {}, apiKey);
      res.write(`data: ${JSON.stringify({ type: 'tool_result', tool: fc.name, data: result })}\n\n`);
      functionResponses.push({ name: fc.name, response: result });
    }

    loopMessages = [
      ...loopMessages,
      { role: 'assistant', content: '', _functionCalls: functionCalls.map(fc => ({ name: fc.name, args: fc.args || {} })) },
      { role: 'user', content: '', _functionResponses: functionResponses },
    ];
  }
}

async function streamGeminiWithSystem(model, systemPrompt, messages, maxTokens, temperature, res) {
  const geminiContents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: typeof m.content === 'string' ? m.content : m.content.map(c => c.text).join('') }],
  }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${CONFIG.GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: geminiContents,
        generationConfig: {
          maxOutputTokens: Math.min(maxTokens, 8192),
          temperature: temperature ?? 0.7,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini ${response.status}: ${err}`);
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
      if (!jsonStr) continue;
      try {
        const data = JSON.parse(jsonStr);
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
        }
      } catch {}
    }
  }
}

export { proxyGemini, streamGemini, streamGeminiWithSystem };
