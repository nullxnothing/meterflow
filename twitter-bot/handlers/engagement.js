import { resolveUsername, getUserTweets, searchTweets, reply, quoteTweet, getBotUserId } from '../lib/twitter.js';
import { generateReply } from '../lib/ai.js';
import { isTweetSafe, isReplySafe } from '../lib/safety.js';
import { formatReply } from '../lib/formatter.js';
import {
  hasReplied, markReplied,
  incrementDaily, getDailyCount,
  isUserOnCooldown, setUserCooldown,
} from '../lib/state.js';
import { LIMITS } from '../config.js';
import { WATCHLIST } from '../watchlist.js';

// Resolved watchlist: { userId, username, followers }
let resolvedWatchlist = [];
// Track last seen tweet per user for polling
const lastSeen = new Map();

const SEARCH_QUERIES = [
  'pump.fun creator fees -is:retweet -is:reply',
  'solana AI agent -is:retweet -is:reply',
  'AI API solana -is:retweet -is:reply',
  'openai API expensive -is:retweet -is:reply',
  'AI agents crypto solana -is:retweet -is:reply',
  'building on solana -is:retweet -is:reply',
  'pumpfun -is:retweet -is:reply',
  'solana developer -is:retweet -is:reply',
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Resolve all watchlist usernames to IDs (run once on startup)
async function initWatchlist() {
  console.log(`[WATCH] Resolving ${WATCHLIST.length} accounts...`);
  const results = [];

  for (const username of WATCHLIST) {
    const user = await resolveUsername(username);
    if (user) {
      results.push({
        userId: user.id,
        username: user.username,
        followers: user.public_metrics?.followers_count || 0,
      });
    }
    // Small delay to avoid rate limits during resolution
    await sleep(1000);
  }

  resolvedWatchlist = results;
  console.log(`[WATCH] Resolved ${results.length}/${WATCHLIST.length} accounts`);
  for (const u of results) {
    console.log(`  @${u.username} (${u.followers} followers)`);
  }
}

// PRIMARY: Poll watchlist timelines for fresh tweets
async function pollWatchlist() {
  const dailyCount = await getDailyCount();
  if (dailyCount >= LIMITS.DAILY_CAP) {
    console.log(`[WATCH] Daily cap reached (${dailyCount}/${LIMITS.DAILY_CAP})`);
    return;
  }

  if (resolvedWatchlist.length === 0) {
    console.log('[WATCH] No accounts resolved yet');
    return;
  }

  let engagedCount = 0;

  for (const account of resolvedWatchlist) {
    if (engagedCount >= LIMITS.MAX_PER_WATCHLIST_RUN) break;

    const current = await getDailyCount();
    if (current >= LIMITS.DAILY_CAP) break;

    const sinceId = lastSeen.get(account.userId) || null;
    const tweets = await getUserTweets(account.userId, sinceId);

    if (tweets.length === 0) continue;

    // Update cursor to newest tweet
    lastSeen.set(account.userId, tweets[0].id);

    // On first poll (no sinceId), just set cursor — don't reply to old tweets
    if (!sinceId) continue;

    for (const tweet of tweets) {
      if (engagedCount >= LIMITS.MAX_PER_WATCHLIST_RUN) break;
      if (await hasReplied(tweet.id)) continue;

      // Skip tweets that are retweets or replies (shouldn't happen with exclude, but safety)
      if (tweet.referenced_tweets?.length > 0) continue;

      const age = Date.now() - new Date(tweet.created_at).getTime();
      if (age > LIMITS.WATCHLIST_MAX_AGE_MS) continue;

      if (!isTweetSafe(tweet.text)) {
        await markReplied(tweet.id);
        continue;
      }

      console.log(`[WATCH] New tweet from @${account.username} (${account.followers} followers, ${(age / 60000).toFixed(0)}min ago)`);
      console.log(`  "${tweet.text.slice(0, 120)}..."`);

      const aiText = await generateReply(tweet.text, account.username, 'proactive');
      if (!aiText || aiText === 'SKIP') {
        console.log(`[WATCH] AI: ${aiText || 'null'}`);
        await markReplied(tweet.id);
        continue;
      }

      if (!isReplySafe(aiText)) {
        await markReplied(tweet.id);
        continue;
      }

      const formatted = formatReply(aiText);
      if (!formatted) continue;

      // Quote tweet for big accounts (more visibility), reply for smaller
      if (account.followers >= LIMITS.QUOTE_THRESHOLD) {
        await quoteTweet(tweet.id, formatted);
        console.log(`[WATCH] Quoted @${account.username}`);
      } else {
        await reply(tweet.id, formatted);
        console.log(`[WATCH] Replied to @${account.username}`);
      }

      await markReplied(tweet.id);
      await incrementDaily();
      await setUserCooldown(account.userId, LIMITS.PER_USER_COOLDOWN_MS);
      engagedCount++;
    }

    // Small delay between account polls to avoid rate limits
    await sleep(500);
  }

  console.log(`[WATCH] Poll done — ${engagedCount} engagements`);
}

// SECONDARY: Keyword search for trending conversations
async function searchEngagement() {
  const dailyCount = await getDailyCount();
  if (dailyCount >= LIMITS.DAILY_CAP) {
    console.log(`[SEARCH] Daily cap reached`);
    return;
  }

  const query = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];
  console.log(`[SEARCH] Query: "${query}"`);

  const results = await searchTweets(query, 25);
  if (!results?.data?.data?.length) {
    console.log('[SEARCH] No results');
    return;
  }

  const tweets = results.data.data;
  const authors = new Map();
  if (results.data.includes?.users) {
    for (const user of results.data.includes.users) {
      authors.set(user.id, user);
    }
  }

  const botUserId = await getBotUserId();
  let engagedCount = 0;

  for (const tweet of tweets) {
    if (engagedCount >= LIMITS.MAX_PER_SEARCH_RUN) break;

    const current = await getDailyCount();
    if (current >= LIMITS.DAILY_CAP) break;

    if (tweet.author_id === botUserId) continue;
    if (await hasReplied(tweet.id)) continue;

    const authorUser = authors.get(tweet.author_id);
    const followers = authorUser?.public_metrics?.followers_count || 0;
    const likes = tweet.public_metrics?.like_count || 0;
    const age = Date.now() - new Date(tweet.created_at).getTime();

    // Only engage with tweets that have traction: 10+ likes within 24h
    if (likes < LIMITS.SEARCH_MIN_LIKES || age > LIMITS.SEARCH_MAX_AGE_MS) continue;

    const authorUsername = authorUser?.username || 'unknown';

    if (await isUserOnCooldown(tweet.author_id)) continue;
    if (!isTweetSafe(tweet.text)) {
      await markReplied(tweet.id);
      continue;
    }

    console.log(`[SEARCH] Target @${authorUsername} (${followers} followers, ${likes} likes, ${(age / 3600000).toFixed(1)}h)`);
    console.log(`  "${tweet.text.slice(0, 120)}..."`);

    const aiText = await generateReply(tweet.text, authorUsername, 'proactive');
    if (!aiText || aiText === 'SKIP') {
      await markReplied(tweet.id);
      continue;
    }

    if (!isReplySafe(aiText)) {
      await markReplied(tweet.id);
      continue;
    }

    const formatted = formatReply(aiText);
    if (!formatted) continue;

    await reply(tweet.id, formatted);
    await markReplied(tweet.id);
    await incrementDaily();
    await setUserCooldown(tweet.author_id, LIMITS.PER_USER_COOLDOWN_MS);
    engagedCount++;
  }

  console.log(`[SEARCH] Done — ${engagedCount} replies`);
}

export { initWatchlist, pollWatchlist, searchEngagement };
