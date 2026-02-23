/**
 * Parse an SSE stream from a fetch Response into an async iterable of events.
 * Works in both Node.js 18+ and browsers — uses native ReadableStream.
 *
 * @param {Response} response - Fetch Response with text/event-stream body
 * @returns {AsyncGenerator<Object>} Parsed SSE events
 */
export async function* parseSSEStream(response) {
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
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            yield { type: 'done' };
            return;
          }
          try {
            yield JSON.parse(data);
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    }

    // Flush remaining buffer
    if (buffer.startsWith('data: ')) {
      const data = buffer.slice(6).trim();
      if (data && data !== '[DONE]') {
        try { yield JSON.parse(data); } catch {}
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a multi-model SSE stream. Events are prefixed with model info.
 *
 * @param {Response} response
 * @returns {AsyncGenerator<import('./types.js').MultiStreamEvent>}
 */
export async function* parseMultiSSEStream(response) {
  for await (const event of parseSSEStream(response)) {
    yield event;
  }
}
