import { BOT_CONFIG, AI } from '../config.js';
import { SYSTEM_PROMPT } from '../knowledge.js';

const channelHistories = new Map();

function getHistory(channelId) {
  if (!channelHistories.has(channelId)) channelHistories.set(channelId, []);
  return channelHistories.get(channelId);
}

function trimHistory(history) {
  while (history.length > AI.MAX_HISTORY * 2) {
    history.shift();
  }
}

function splitMessage(text) {
  const chunks = [];
  while (text.length > AI.DISCORD_CHAR_LIMIT) {
    let splitAt = text.lastIndexOf('\n', AI.DISCORD_CHAR_LIMIT);
    if (splitAt < AI.DISCORD_CHAR_LIMIT / 2) splitAt = AI.DISCORD_CHAR_LIMIT;
    chunks.push(text.slice(0, splitAt));
    text = text.slice(splitAt).trimStart();
  }
  if (text.length > 0) chunks.push(text);
  return chunks;
}

async function getAIResponse(channelId, userMessage, username) {
  const history = getHistory(channelId);

  // Build messages array — system prompt as first user/assistant pair (provider-agnostic)
  const messages = [
    { role: 'user', content: `[System Instructions]\n${SYSTEM_PROMPT}` },
    { role: 'assistant', content: 'Understood. I\'ll follow these guidelines for all responses.' },
    ...history,
    { role: 'user', content: `[${username}]: ${userMessage}` },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI.TIMEOUT_MS);

  try {
    const res = await fetch(`${BOT_CONFIG.API_PROXY_URL}/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BOT_CONFIG.BOT_API_KEY}`,
      },
      body: JSON.stringify({
        model: BOT_CONFIG.AI_MODEL,
        messages,
        max_tokens: AI.MAX_TOKENS,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[AI] Proxy returned ${res.status}: ${body}`);
      return null;
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content
      || data.content?.[0]?.text
      || null;

    if (reply) {
      history.push(
        { role: 'user', content: `[${username}]: ${userMessage}` },
        { role: 'assistant', content: reply },
      );
      trimHistory(history);
    }

    return reply;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[AI] Request timed out');
    } else {
      console.error('[AI] Request failed:', err.message);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function classifySpam(content) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${BOT_CONFIG.API_PROXY_URL}/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BOT_CONFIG.BOT_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: `Classify this Discord message as spam or not. Reply with exactly one word: SPAM or NOT_SPAM\n\nMessage: "${content}"`,
          },
        ],
        max_tokens: 10,
      }),
      signal: controller.signal,
    });

    if (!res.ok) return 'NOT_SPAM';

    const data = await res.json();
    const reply = (data.choices?.[0]?.message?.content || data.content?.[0]?.text || '').trim().toUpperCase();
    return reply.includes('SPAM') && !reply.includes('NOT') ? 'SPAM' : 'NOT_SPAM';
  } catch {
    return 'NOT_SPAM'; // Fail open
  } finally {
    clearTimeout(timeout);
  }
}

export { getAIResponse, classifySpam, splitMessage };
