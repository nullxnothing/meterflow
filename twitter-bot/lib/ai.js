import { CFG, AI_CFG } from '../config.js';
import { SYSTEM_PROMPT } from '../knowledge.js';

async function generateReply(tweetText, authorUsername, context = 'mention') {
  if (!CFG.BOT_API_KEY) {
    console.error('[AI] No BOT_API_KEY set — cannot generate replies');
    return null;
  }

  const contextHint = context === 'mention'
    ? `Someone mentioned your project. Write a helpful reply that explains what Meterflow does.`
    : `You found this tweet on crypto Twitter. Write a reply that adds to the conversation and clearly explains what Meterflow does.`;

  const messages = [
    { role: 'user', content: `[System Instructions]\n${SYSTEM_PROMPT}` },
    { role: 'assistant', content: 'Got it. I write natural replies that explain how Meterflow lets APIs quote requests, accept Solana USDC payments, verify them, and return receipts for agents.' },
    {
      role: 'user',
      content: `${contextHint}

Tweet from @${authorUsername}:
"${tweetText}"

Write a reply (120-260 chars) that:
1. Reacts to what @${authorUsername} said — show you read their tweet
2. Clearly explains what Meterflow does in simple terms - APIs quote requests, agents pay in USDC on Solana, the gateway verifies payment and returns a receipt
3. Sounds like a real dev in a conversation, not an ad

Output ONLY the reply text. No quotes, no labels, no explanation.
Say SKIP if the tweet is off-topic, inflammatory, or replying would look forced.`,
    },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_CFG.TIMEOUT_MS);

  try {
    console.log(`[AI] Calling ${CFG.AI_MODEL} via ${CFG.API_PROXY_URL}/v1/chat`);

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
      console.error(`[AI] Proxy returned ${res.status}: ${body.slice(0, 300)}`);
      return null;
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content
      || data.content?.[0]?.text
      || null;

    if (!reply) {
      console.error('[AI] No content in response:', JSON.stringify(data).slice(0, 300));
      return null;
    }

    const trimmed = reply
      .trim()
      .replace(/^["']|["']$/g, '')
      .replace(/^(Reply|Response|Here'?s?\s*(my|a|the)\s*reply):?\s*/i, '')
      .trim();

    if (trimmed.toUpperCase() === 'SKIP') return 'SKIP';

    console.log(`[AI] Generated (${trimmed.length} chars): "${trimmed.slice(0, 150)}..."`);
    return trimmed;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[AI] Request timed out after 30s');
    } else {
      console.error('[AI] Request failed:', err.message);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export { generateReply };
