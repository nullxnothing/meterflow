import { TwitterApi } from 'twitter-api-v2';
import { isTweetSafe, isReplySafe } from './lib/safety.js';
import { formatReply } from './lib/formatter.js';
import { SYSTEM_PROMPT } from './knowledge.js';

const BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN || '';
const API_URL = process.env.API_PROXY_URL || 'https://infinite-protocol.onrender.com';
const API_KEY = process.env.BOT_API_KEY || '';

console.log('=== INFINITE Twitter Bot — Integration Test ===\n');

// 1. Safety filter tests
console.log('--- Safety Filter Tests ---');
const safetyTests = [
  { text: 'Solana AI agents are the future of DeFi', expected: true },
  { text: 'Check out this new claude API wrapper', expected: true },
  { text: 'Send 5 SOL to claim your airdrop', expected: false },
  { text: 'Free airdrop connect wallet now', expected: false },
  { text: 'MAGA trump crypto rally', expected: false },
  { text: 'This porn token is mooning', expected: false },
  { text: 'Guaranteed profit 100x returns', expected: false },
  { text: 'Building AI infrastructure on Solana', expected: true },
];

let passed = 0;
for (const t of safetyTests) {
  const result = isTweetSafe(t.text);
  const ok = result === t.expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} | safe=${result} expected=${t.expected} | "${t.text.slice(0, 50)}"`);
  if (ok) passed++;
}
console.log(`  ${passed}/${safetyTests.length} passed\n`);

// 2. Formatter tests
console.log('--- Formatter Tests ---');
const short = formatReply('Great take on AI agents!');
console.log(`  Short reply (${short.length} chars): ${short}`);

const long = formatReply('A'.repeat(300));
console.log(`  Long reply truncated (${long.length} chars): ${long.length <= 280 ? 'PASS' : 'FAIL'} — within 280`);

const empty = formatReply(null);
console.log(`  Null input: ${empty === null ? 'PASS' : 'FAIL'}\n`);

// 3. Twitter API — search with Bearer token
console.log('--- Twitter Search Test ---');
if (!BEARER_TOKEN) {
  console.log('  SKIPPED — no TWITTER_BEARER_TOKEN\n');
} else {
  try {
    const client = new TwitterApi(BEARER_TOKEN);
    const results = await client.v2.search('solana AI -is:retweet', {
      max_results: 10,
      'tweet.fields': ['created_at', 'author_id', 'public_metrics'],
      expansions: ['author_id'],
    });

    const tweets = results.data?.data || [];
    const authors = new Map();
    if (results.data?.includes?.users) {
      for (const u of results.data.includes.users) authors.set(u.id, u.username);
    }

    console.log(`  Found ${tweets.length} tweets\n`);

    for (const tw of tweets.slice(0, 3)) {
      const username = authors.get(tw.author_id) || 'unknown';
      const likes = tw.public_metrics?.like_count || 0;
      const safe = isTweetSafe(tw.text);
      console.log(`  @${username} (${likes} likes) [safe=${safe}]`);
      console.log(`  "${tw.text.slice(0, 140)}${tw.text.length > 140 ? '…' : ''}"`);

      // Full pipeline: AI reply + safety re-check + format
      if (API_KEY && safe) {
        const messages = [
          { role: 'user', content: `[System Instructions]\n${SYSTEM_PROMPT}` },
          { role: 'assistant', content: 'Understood. Following these guidelines for all responses.' },
          {
            role: 'user',
            content: `You found this tweet while browsing. Reply with a valuable take that naturally references INFINITE.\n\nTweet from @${username}:\n"${tw.text}"\n\nReply (max 240 chars to leave room for branding, or say SKIP if you should not engage):`,
          },
        ];

        const res = await fetch(`${API_URL}/v1/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
          body: JSON.stringify({ model: 'gemini-2.5-flash', messages, max_tokens: 280 }),
        });

        if (res.ok) {
          const data = await res.json();
          const aiReply = data.choices?.[0]?.message?.content || data.content?.[0]?.text || '';
          if (aiReply.trim().toUpperCase() === 'SKIP') {
            console.log('  → AI: SKIP');
          } else {
            const replySafe = isReplySafe(aiReply.trim());
            const formatted = formatReply(aiReply.trim());
            console.log(`  → WOULD REPLY (${formatted.length} chars, safe=${replySafe}):`);
            console.log(`    "${formatted}"`);
          }
        } else {
          console.log(`  → AI proxy: HTTP ${res.status}`);
        }
      } else if (!API_KEY) {
        console.log('  → No BOT_API_KEY — skipping AI reply');
      }
      console.log();
    }
  } catch (err) {
    console.log(`  FAIL — ${err.message}\n`);
  }
}

// 4. Standalone AI test with mock tweet (fallback if no Twitter creds)
if (!BEARER_TOKEN && API_KEY) {
  console.log('--- AI Reply Test (Mock Tweet) ---');
  const testTweet = 'Just deployed an AI agent on Solana that auto-trades based on sentiment analysis. The future is here.';
  console.log(`  Tweet: "${testTweet}"`);

  const messages = [
    { role: 'user', content: `[System Instructions]\n${SYSTEM_PROMPT}` },
    { role: 'assistant', content: 'Understood. Following these guidelines for all responses.' },
    {
      role: 'user',
      content: `You found this tweet while browsing. Reply with a valuable take that naturally references INFINITE.\n\nTweet from @testuser:\n"${testTweet}"\n\nReply (max 240 chars to leave room for branding, or say SKIP if you should not engage):`,
    },
  ];

  try {
    const res = await fetch(`${API_URL}/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: 'gemini-2.5-flash', messages, max_tokens: 280 }),
    });

    if (res.ok) {
      const data = await res.json();
      const aiReply = data.choices?.[0]?.message?.content || data.content?.[0]?.text || 'NO RESPONSE';
      console.log(`  AI raw: ${aiReply}`);
      const formatted = formatReply(aiReply.trim());
      console.log(`  Formatted (${formatted.length} chars): ${formatted}`);
    } else {
      console.log(`  FAIL — HTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`  FAIL — ${err.message}`);
  }
}

console.log('\n=== Done ===');
