const TWITTER_API = 'https://api.twitter.com';
const FETCH_TIMEOUT_MS = 10_000;

async function twitterFetch(path, token, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const response = await fetch(`${TWITTER_API}${path}`, {
    signal: controller.signal,
    headers,
    ...options,
  });

  clearTimeout(timer);

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`X API ${response.status}: ${body.slice(0, 300)}`);
  }

  return response.json();
}

export async function executeTwitterLookup({ action, query, username, user_id, text, tweet_id }, token) {
  if (!action) return { error: 'action is required (search, user, timeline, me, tweet, reply)' };
  if (!token) return { error: 'X/Twitter not connected. Connect via Dashboard > Connections.' };

  try {
    switch (action) {
      case 'me':
        return await twitterFetch('/2/users/me?user.fields=public_metrics,description,profile_image_url', token);

      case 'user': {
        if (!username) return { error: 'username is required for user action' };
        return await twitterFetch(`/2/users/by/username/${encodeURIComponent(username)}?user.fields=public_metrics,description,profile_image_url`, token);
      }

      case 'search': {
        if (!query) return { error: 'query is required for search action' };
        const params = new URLSearchParams({
          query,
          max_results: '10',
          'tweet.fields': 'created_at,author_id,public_metrics',
          'user.fields': 'username,public_metrics',
          expansions: 'author_id',
        });
        return await twitterFetch(`/2/tweets/search/recent?${params}`, token);
      }

      case 'timeline': {
        if (!user_id) return { error: 'user_id is required for timeline action' };
        const params = new URLSearchParams({
          max_results: '10',
          'tweet.fields': 'created_at,public_metrics',
          exclude: 'retweets',
        });
        return await twitterFetch(`/2/users/${encodeURIComponent(user_id)}/tweets?${params}`, token);
      }

      case 'tweet': {
        if (!text) return { error: 'text is required for tweet action' };
        return await twitterFetch('/2/tweets', token, {
          method: 'POST',
          body: JSON.stringify({ text }),
        });
      }

      case 'reply': {
        if (!text || !tweet_id) return { error: 'text and tweet_id are required for reply action' };
        return await twitterFetch('/2/tweets', token, {
          method: 'POST',
          body: JSON.stringify({
            text,
            reply: { in_reply_to_tweet_id: tweet_id },
          }),
        });
      }

      default:
        return { error: `Unknown action: ${action}. Use: search, user, timeline, me, tweet, reply` };
    }
  } catch (err) {
    if (err.name === 'AbortError') return { error: 'X API request timed out (10s limit)' };
    return { error: err.message };
  }
}
