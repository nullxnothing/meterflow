import { CFG, AI_CFG } from '../config.js';
import { SYSTEM_PROMPT } from '../knowledge.js';

async function generateReply(tweetText, authorUsername, context = 'mention') {
  if (!CFG.BOT_API_KEY) return null;

  const contextHint = context === 'mention'
    ? `Someone mentioned you or your project. Write a natural, helpful reply.`
    : `You found this tweet while browsing crypto Twitter. Write a natural reply that adds to the conversation.`;

  const messages = [
    { role: 'user', content: `[System Instructions]\n${SYSTEM_PROMPT}` },
    { role: 'assistant', content: 'Understood. I write natural, conversational replies that weave in what INFINITE does without sounding like a bot.' },
    {
      role: 'user',
      content: `${contextHint}

Tweet from @${authorUsername}:
"${tweetText}"

Write a complete reply (100-250 chars) that:
1. Reacts to what @${authorUsername} actually said — show you read it
2. Naturally connects the topic to AI API access or building on Solana if relevant
3. Sounds like a real person in a real conversation, not an ad

Output ONLY the reply text. No quotes, no labels, no explanation.
Say SKIP if the tweet is off-topic, inflammatory, or replying would look forced.`,
    },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_CFG.TIMEOUT_MS);

  try {
    const res = await fetch(`${CFG.API_PROXY_URL}/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CFG.BOT_API_KEY}`,
      },
      body: JSON.stringify({
        model: CFG.AI_MODEL,
        messages,
        max_tokens: AI_CFG.MAX_TOKENS,
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

    if (!reply) return null;

    const trimmed = reply
      .trim()
      .replace(/^["']|["']$/g, '')
      .replace(/^(Reply|Response|Here'?s?\s*(my|a|the)\s*reply):?\s*/i, '')
      .trim();

    if (trimmed.toUpperCase() === 'SKIP') return 'SKIP';

    return trimmed;
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

export { generateReply };
