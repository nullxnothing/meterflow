// SocialData.tools API client — cheaper alternative to X API for bulk data
// Pricing: $0.0002 per tweet or user profile returned ($0.20 per 1000 items)
// Docs: https://docs.socialdata.tools
import { logger } from './logger.js';

const API_BASE = 'https://api.socialdata.tools';
const log = logger.child({ mod: 'socialdata' });
const FETCH_TIMEOUT = 15_000;

function getApiKey() {
  return process.env.SOCIALDATA_API_KEY || null;
}

async function sdFetch(path, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('SOCIALDATA_API_KEY not set');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);

  const res = await fetch(`${API_BASE}${path}`, {
    signal: ctrl.signal,
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
      ...(options.headers || {}),
    },
  });
  clearTimeout(timer);

  if (res.status === 402) throw new Error('credits_depleted');
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SocialData ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ── User endpoints ──

// Batch lookup by usernames — 1 call for up to 100 users
// Cost: $0.0002 per profile = $0.004 for 20 profiles
export async function getUsersByUsernames(usernames) {
  return sdFetch('/twitter/users-by-usernames', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames }),
  });
}

// Get user profile by screen_name
// Cost: $0.0002
export async function getUserProfile(screenName) {
  return sdFetch(`/twitter/user/${encodeURIComponent(screenName)}`);
}

// Get who a user is following (paginated, ~200 per page)
// Cost: $0.0002 per user returned
export async function getUserFollowing(userId, cursor = null) {
  const params = new URLSearchParams({ user_id: userId });
  if (cursor) params.set('cursor', cursor);
  return sdFetch(`/twitter/friends/list?${params}`);
}

// Get user's followers (paginated)
// Cost: $0.0002 per follower returned
export async function getUserFollowers(userId, cursor = null) {
  const params = new URLSearchParams({ user_id: userId });
  if (cursor) params.set('cursor', cursor);
  return sdFetch(`/twitter/followers/list?${params}`);
}

// Get user's recent tweets
// Cost: $0.0002 per tweet returned (~20 per page)
export async function getUserTweets(userId, cursor = null) {
  const url = cursor
    ? `/twitter/user/${userId}/tweets?cursor=${encodeURIComponent(cursor)}`
    : `/twitter/user/${userId}/tweets`;
  return sdFetch(url);
}

// ── Helpers ──

// Normalize SocialData user object to our internal format
export function normalizeUser(sdUser) {
  if (!sdUser) return null;
  return {
    twitterId: sdUser.id_str || String(sdUser.id),
    username: sdUser.screen_name,
    displayName: sdUser.name,
    bio: sdUser.description || '',
    profileImage: sdUser.profile_image_url_https || '',
    followers: String(sdUser.followers_count || 0),
    following: String(sdUser.friends_count || 0),
    tweetCount: String(sdUser.statuses_count || 0),
    createdAt: sdUser.created_at || '',
  };
}

// Check if SocialData is configured
export function isSocialDataEnabled() {
  return !!getApiKey();
}

export default {
  getUsersByUsernames,
  getUserProfile,
  getUserFollowing,
  getUserFollowers,
  getUserTweets,
  normalizeUser,
  isSocialDataEnabled,
};
