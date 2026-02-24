import { TwitterApi } from 'twitter-api-v2';
import { CFG } from '../config.js';

const userClient = new TwitterApi({
  appKey: CFG.TWITTER_APP_KEY,
  appSecret: CFG.TWITTER_APP_SECRET,
  accessToken: CFG.TWITTER_ACCESS_TOKEN,
  accessSecret: CFG.TWITTER_ACCESS_SECRET,
});

const readClient = new TwitterApi(CFG.TWITTER_BEARER_TOKEN || CFG.TWITTER_APP_KEY);

const rw = userClient.readWrite;
const ro = CFG.TWITTER_BEARER_TOKEN ? readClient.readOnly : rw;

let botUserId = null;

async function getBotUserId() {
  if (botUserId) return botUserId;
  const me = await rw.v2.me();
  botUserId = me.data.id;
  console.log(`[TWITTER] Authenticated as @${me.data.username} (${botUserId})`);
  return botUserId;
}

async function resolveUsername(username) {
  try {
    const user = await ro.v2.userByUsername(username, {
      'user.fields': ['public_metrics'],
    });
    return user.data || null;
  } catch (err) {
    console.error(`[TWITTER] Failed to resolve @${username}:`, err.message);
    return null;
  }
}

async function getUserTweets(userId, sinceId) {
  const params = {
    max_results: 5,
    'tweet.fields': ['created_at', 'author_id', 'public_metrics', 'referenced_tweets'],
    exclude: ['retweets', 'replies'],
  };
  if (sinceId) params.since_id = sinceId;

  try {
    const timeline = await ro.v2.userTimeline(userId, params);
    return timeline.data?.data || [];
  } catch (err) {
    console.error(`[TWITTER] Timeline fetch failed for ${userId}:`, err.message);
    return [];
  }
}

async function searchTweets(query, maxResults = 10) {
  try {
    const result = await ro.v2.search(query, {
      max_results: maxResults,
      'tweet.fields': ['created_at', 'author_id', 'public_metrics', 'conversation_id'],
      'user.fields': ['public_metrics', 'username'],
      expansions: ['author_id'],
      sort_order: 'recency',
    });
    return result;
  } catch (err) {
    console.error('[TWITTER] Search failed:', err.message);
    return null;
  }
}

async function reply(tweetId, text) {
  if (CFG.DRY_RUN) {
    console.log(`[DRY_RUN] Would reply to ${tweetId}:\n${text}`);
    return { data: { id: 'dry-run-id' } };
  }

  try {
    const result = await rw.v2.reply(text, tweetId);
    console.log(`[TWITTER] Replied to ${tweetId} -> ${result.data.id}`);
    return result;
  } catch (err) {
    console.error(`[TWITTER] Reply failed for ${tweetId}:`, err.message);
    return null;
  }
}

async function quoteTweet(tweetId, text) {
  if (CFG.DRY_RUN) {
    console.log(`[DRY_RUN] Would quote ${tweetId}:\n${text}`);
    return { data: { id: 'dry-run-id' } };
  }

  try {
    const result = await rw.v2.tweet({
      text,
      quote_tweet_id: tweetId,
    });
    console.log(`[TWITTER] Quoted ${tweetId} -> ${result.data.id}`);
    return result;
  } catch (err) {
    console.error(`[TWITTER] Quote failed for ${tweetId}:`, err.message);
    return null;
  }
}

async function likeTweet(tweetId) {
  if (CFG.DRY_RUN) {
    console.log(`[DRY_RUN] Would like ${tweetId}`);
    return true;
  }

  try {
    const userId = await getBotUserId();
    await rw.v2.like(userId, tweetId);
    return true;
  } catch (err) {
    // 139 = already liked — not an error
    if (err.code === 139 || err.message?.includes('already')) return true;
    console.error(`[TWITTER] Like failed for ${tweetId}:`, err.message);
    return false;
  }
}

async function postTweet(text) {
  if (CFG.DRY_RUN) {
    console.log(`[DRY_RUN] Would tweet:\n${text}`);
    return { data: { id: 'dry-run-id' } };
  }

  try {
    const result = await rw.v2.tweet({ text });
    console.log(`[TWITTER] Posted tweet -> ${result.data.id}`);
    return result;
  } catch (err) {
    console.error(`[TWITTER] Post failed:`, err.message);
    return null;
  }
}

export { getBotUserId, resolveUsername, getUserTweets, searchTweets, reply, quoteTweet, likeTweet, postTweet };
