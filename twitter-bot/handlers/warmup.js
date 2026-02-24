import { getUserTweets, searchTweets, likeTweet, getBotUserId } from '../lib/twitter.js';
import { isTweetSafe } from '../lib/safety.js';
import { hasReplied, markReplied } from '../lib/state.js';
import { LIMITS } from '../config.js';

// Track liked tweets this session to avoid double-likes
const likedThisSession = new Set();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jitter(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs)) + minMs;
}

/**
 * Warmup: like 8-12 tweets from watchlist + search results over ~10-15 min.
 * Call this BEFORE posting your own tweet.
 *
 * @param {Array<{userId: string, username: string}>} resolvedWatchlist
 * @param {Object} opts
 * @param {number} opts.targetLikes - total likes to aim for (default 10)
 * @param {number} opts.delayMinMs - min delay between likes in ms (default 45000)
 * @param {number} opts.delayMaxMs - max delay between likes in ms (default 90000)
 */
async function runWarmup(resolvedWatchlist, opts = {}) {
  const targetLikes = opts.targetLikes || 10;
  const delayMin = opts.delayMinMs || 45_000;
  const delayMax = opts.delayMaxMs || 90_000;
  const startTime = Date.now();

  console.log(`[WARMUP] Starting warmup — targeting ${targetLikes} likes over ~${Math.round((targetLikes * (delayMin + delayMax) / 2) / 60000)} min`);

  let liked = 0;
  const candidates = [];

  // Phase 1: Collect fresh tweets from watchlist accounts
  const shuffled = [...resolvedWatchlist].sort(() => Math.random() - 0.5);
  const accountsToScan = shuffled.slice(0, 8);

  for (const account of accountsToScan) {
    try {
      const tweets = await getUserTweets(account.userId, null);
      for (const tweet of tweets.slice(0, 3)) {
        if (likedThisSession.has(tweet.id)) continue;
        if (!isTweetSafe(tweet.text)) continue;
        const age = Date.now() - new Date(tweet.created_at).getTime();
        if (age > 24 * 60 * 60 * 1000) continue; // skip >24h old
        candidates.push({
          id: tweet.id,
          username: account.username,
          text: tweet.text,
          likes: tweet.public_metrics?.like_count || 0,
          age,
        });
      }
    } catch (err) {
      console.warn(`[WARMUP] Failed to fetch @${account.username}:`, err.message);
    }
    await sleep(500);
  }

  // Phase 2: Collect from keyword search
  const searchQueries = [
    'solana AI -is:retweet -is:reply',
    'building on solana -is:retweet -is:reply',
    'AI API -is:retweet -is:reply',
  ];

  const query = searchQueries[Math.floor(Math.random() * searchQueries.length)];
  try {
    const results = await searchTweets(query, 15);
    const tweets = results?.data?.data || [];
    const authors = new Map();
    if (results?.data?.includes?.users) {
      for (const user of results.data.includes.users) {
        authors.set(user.id, user);
      }
    }

    const botId = await getBotUserId();
    for (const tweet of tweets) {
      if (tweet.author_id === botId) continue;
      if (likedThisSession.has(tweet.id)) continue;
      if (!isTweetSafe(tweet.text)) continue;
      const author = authors.get(tweet.author_id);
      candidates.push({
        id: tweet.id,
        username: author?.username || 'unknown',
        text: tweet.text,
        likes: tweet.public_metrics?.like_count || 0,
        age: Date.now() - new Date(tweet.created_at).getTime(),
      });
    }
  } catch (err) {
    console.warn(`[WARMUP] Search failed:`, err.message);
  }

  // Dedupe and prioritize: prefer tweets with some engagement but not viral
  const unique = [];
  const seen = new Set();
  for (const c of candidates) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    unique.push(c);
  }

  // Sort by sweet spot: 5-500 likes (engaged but not viral) and fresher first
  unique.sort((a, b) => {
    const aScore = (a.likes >= 5 && a.likes <= 500 ? 10 : 0) - (a.age / 3600000);
    const bScore = (b.likes >= 5 && b.likes <= 500 ? 10 : 0) - (b.age / 3600000);
    return bScore - aScore;
  });

  console.log(`[WARMUP] Collected ${unique.length} candidates`);

  // Phase 3: Like with human-like spacing
  for (const tweet of unique) {
    if (liked >= targetLikes) break;

    const success = await likeTweet(tweet.id);
    if (success) {
      likedThisSession.add(tweet.id);
      liked++;
      console.log(`[WARMUP] ${liked}/${targetLikes} Liked @${tweet.username}: "${tweet.text.slice(0, 80)}..."`);
    }

    if (liked < targetLikes) {
      const delay = jitter(delayMin, delayMax);
      console.log(`[WARMUP] Waiting ${(delay / 1000).toFixed(0)}s...`);
      await sleep(delay);
    }
  }

  const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log(`[WARMUP] Done — ${liked} likes in ${elapsed} min`);
  return liked;
}

export { runWarmup };
