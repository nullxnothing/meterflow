import { Router } from 'express';
import { authenticateApiKey } from '../middleware.js';
import { CONFIG } from '../config.js';
import { ensureValidTwitterToken } from '../oauth/routes.js';
import { logger } from '../lib/logger.js';

const router = Router();
const TWITTER_API = 'https://api.twitter.com';
const FETCH_TIMEOUT_MS = 10_000;

function requireArchitectTier(req, res, next) {
  const { tier } = req.infinite;
  if (tier !== 'architect') {
    return res.status(403).json({
      error: 'tier_restricted',
      message: 'X API access requires Architect tier.',
      requiredTier: 'Architect',
      currentTier: CONFIG.TIERS[tier]?.label || tier,
    });
  }
  next();
}

async function twitterFetch(path, token, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const response = await fetch(`${TWITTER_API}${path}`, {
    signal: controller.signal,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...options,
  });

  clearTimeout(timer);

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`X API ${response.status}: ${body.slice(0, 300)}`);
  }

  return response.json();
}

router.post('/twitter/:action', authenticateApiKey, requireArchitectTier, async (req, res) => {
  const { action } = req.params;
  const { apiKey } = req.infinite;

  const token = await ensureValidTwitterToken(apiKey);
  if (!token) {
    return res.status(401).json({
      error: 'twitter_not_connected',
      message: 'Connect your X account or add a Bearer Token in Dashboard > Connections.',
    });
  }

  try {
    let result;

    switch (action) {
      case 'me': {
        result = await twitterFetch('/2/users/me?user.fields=public_metrics,description,profile_image_url', token);
        break;
      }

      case 'user': {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'username is required' });
        result = await twitterFetch(`/2/users/by/username/${encodeURIComponent(username)}?user.fields=public_metrics,description,profile_image_url`, token);
        break;
      }

      case 'search': {
        const { query, max_results = 10 } = req.body;
        if (!query) return res.status(400).json({ error: 'query is required' });
        const params = new URLSearchParams({
          query,
          max_results: String(Math.max(10, Math.min(max_results, 100))),
          'tweet.fields': 'created_at,author_id,public_metrics,conversation_id',
          'user.fields': 'username,public_metrics',
          expansions: 'author_id',
        });
        result = await twitterFetch(`/2/tweets/search/recent?${params}`, token);
        break;
      }

      case 'timeline': {
        const { user_id, max_results = 10 } = req.body;
        if (!user_id) return res.status(400).json({ error: 'user_id is required' });
        const params = new URLSearchParams({
          max_results: String(Math.max(10, Math.min(max_results, 100))),
          'tweet.fields': 'created_at,public_metrics,referenced_tweets',
          exclude: 'retweets',
        });
        result = await twitterFetch(`/2/users/${encodeURIComponent(user_id)}/tweets?${params}`, token);
        break;
      }

      case 'tweet': {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'text is required' });
        result = await twitterFetch('/2/tweets', token, {
          method: 'POST',
          body: JSON.stringify({ text }),
        });
        break;
      }

      case 'reply': {
        const { text, tweet_id } = req.body;
        if (!text || !tweet_id) return res.status(400).json({ error: 'text and tweet_id are required' });
        result = await twitterFetch('/2/tweets', token, {
          method: 'POST',
          body: JSON.stringify({
            text,
            reply: { in_reply_to_tweet_id: tweet_id },
          }),
        });
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}. Available: me, user, search, timeline, tweet, reply` });
    }

    res.json(result);
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'X API request timed out (10s limit)' });
    }
    logger.error('Twitter proxy error', { action, err: err.message });
    res.status(502).json({ error: 'upstream_error', message: err.message });
  }
});

export default router;
