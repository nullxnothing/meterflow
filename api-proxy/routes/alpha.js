// Infinite Alpha — CT intelligence scanner API routes
import { Router } from 'express';
import { authenticateApiKey } from '../middleware.js';
import { ensureValidTwitterToken } from '../oauth/routes.js';
import { logger } from '../lib/logger.js';
import {
  getProfile, setProfile, getProfileHistory,
  getFollowersOf, getFollowerCount, getFollowsOf,
  getDiscoverFeed, getTrendingFeed,
  getAlerts, getCAs,
  getNote, setNote, deleteNote,
  getKeyProfile, getKeyProfileCount,
  addWatchedProfile, getWatchedProfiles, removeWatchedProfile,
} from '../lib/kv-alpha.js';
import { isSocialDataEnabled, getUserProfile, normalizeUser } from '../lib/socialdata.js';

const router = Router();
const log = logger.child({ mod: 'alpha' });
const TWITTER_API = 'https://api.twitter.com';
const FETCH_TIMEOUT = 8_000;
const SOLANA_CA_REGEX = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

async function twitterGet(path, token) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  const res = await fetch(`${TWITTER_API}${path}`, {
    signal: ctrl.signal,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  clearTimeout(timer);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`X API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ── Scan a Twitter profile ──
router.get('/alpha/profile/:username', authenticateApiKey, async (req, res) => {
  const { username } = req.params;
  const { apiKey } = req.infinite;

  try {
    let twitterId, profileData;

    if (isSocialDataEnabled()) {
      // SocialData: $0.0002 per lookup (vs opaque X API credit cost)
      const sdUser = await getUserProfile(username);
      if (!sdUser) return res.status(404).json({ error: 'user_not_found' });
      const norm = normalizeUser(sdUser);
      twitterId = norm.twitterId;
      profileData = {
        twitterId,
        username: norm.username,
        displayName: norm.displayName,
        bio: norm.bio,
        profileImage: norm.profileImage,
        followers: Number(norm.followers),
        following: Number(norm.following),
        tweets: Number(norm.tweetCount),
        createdAt: norm.createdAt,
      };
    } else {
      // X API fallback
      const token = await ensureValidTwitterToken(apiKey);
      if (!token) return res.status(401).json({ error: 'twitter_not_connected' });

      const fields = 'public_metrics,description,profile_image_url,created_at';
      const userData = await twitterGet(
        `/2/users/by/username/${encodeURIComponent(username)}?user.fields=${fields}`,
        token,
      );
      if (!userData.data) return res.status(404).json({ error: 'user_not_found' });

      const user = userData.data;
      twitterId = user.id;
      profileData = {
        twitterId,
        username: user.username,
        displayName: user.name,
        bio: user.description,
        profileImage: user.profile_image_url,
        followers: user.public_metrics?.followers_count,
        following: user.public_metrics?.following_count,
        tweets: user.public_metrics?.tweet_count,
        createdAt: user.created_at,
      };
    }

    // Check for rename history
    const history = await getProfileHistory(twitterId);
    const cached = await getProfile(twitterId);
    const isRenamed = cached && cached.username && cached.username !== profileData.username;

    // Update cache
    await setProfile(twitterId, {
      username: profileData.username,
      displayName: profileData.displayName,
      bio: profileData.bio || '',
      profileImage: profileData.profileImage || '',
      followers: String(profileData.followers || 0),
      following: String(profileData.following || 0),
      tweetCount: String(profileData.tweets || 0),
      createdAt: profileData.createdAt || '',
      lastScanned: String(Date.now()),
    });

    const keyFollowers = await getFollowersOf(twitterId, 20);
    const keyFollowerCount = await getFollowerCount(twitterId);
    const cas = await getCAs(twitterId);
    const isKeyProfile = !!(await getKeyProfile(twitterId));

    res.json({
      profile: profileData,
      renameHistory: history,
      isRenamed,
      keyFollowers,
      keyFollowerCount,
      contractAddresses: cas,
      isKeyProfile,
    });
  } catch (err) {
    log.error('Profile scan failed', { username, err: err.message });
    res.status(502).json({ error: 'scan_failed', message: err.message });
  }
});

// ── Key followers of a project ──
router.get('/alpha/profile/:twitterId/parents', authenticateApiKey, async (req, res) => {
  const { twitterId } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = parseInt(req.query.offset) || 0;

  try {
    const followers = await getFollowersOf(twitterId, limit, offset);
    const count = await getFollowerCount(twitterId);

    // Enrich with key profile data
    const enriched = await Promise.all(
      followers.map(async (f) => {
        const kp = await getKeyProfile(f.twitterId);
        const profile = await getProfile(f.twitterId);
        return {
          ...f,
          username: profile?.username || kp?.username || null,
          displayName: profile?.displayName || kp?.displayName || null,
          category: kp?.category || null,
          profileImage: profile?.profileImage || null,
        };
      }),
    );

    res.json({ parents: enriched, total: count });
  } catch (err) {
    log.error('Parents fetch failed', { twitterId, err: err.message });
    res.status(500).json({ error: 'fetch_failed' });
  }
});

// ── What a key profile follows ──
router.get('/alpha/profile/:twitterId/children', authenticateApiKey, async (req, res) => {
  const { twitterId } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = parseInt(req.query.offset) || 0;

  try {
    const follows = await getFollowsOf(twitterId, limit, offset);

    const enriched = await Promise.all(
      follows.map(async (f) => {
        const profile = await getProfile(f.twitterId);
        return {
          ...f,
          username: profile?.username || null,
          displayName: profile?.displayName || null,
          followers: profile?.followers ? Number(profile.followers) : null,
          profileImage: profile?.profileImage || null,
        };
      }),
    );

    res.json({ children: enriched });
  } catch (err) {
    log.error('Children fetch failed', { twitterId, err: err.message });
    res.status(500).json({ error: 'fetch_failed' });
  }
});

// ── Discover feed ──
router.get('/alpha/discover', authenticateApiKey, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = parseInt(req.query.offset) || 0;

  try {
    const feed = await getDiscoverFeed(limit, offset);
    res.json({ projects: feed });
  } catch (err) {
    log.error('Discover feed failed', { err: err.message });
    res.status(500).json({ error: 'fetch_failed' });
  }
});

// ── Trending feed ──
router.get('/alpha/trending', authenticateApiKey, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);

  try {
    const feed = await getTrendingFeed(limit);
    res.json({ projects: feed });
  } catch (err) {
    log.error('Trending feed failed', { err: err.message });
    res.status(500).json({ error: 'fetch_failed' });
  }
});

// ── Alerts for a profile ──
router.get('/alpha/alerts/:twitterId', authenticateApiKey, async (req, res) => {
  const { twitterId } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);

  try {
    const alerts = await getAlerts(twitterId, limit);
    res.json({ alerts });
  } catch (err) {
    log.error('Alerts fetch failed', { twitterId, err: err.message });
    res.status(500).json({ error: 'fetch_failed' });
  }
});

// ── Contract addresses for a profile ──
router.get('/alpha/ca/:twitterId', authenticateApiKey, async (req, res) => {
  const { twitterId } = req.params;

  try {
    const cas = await getCAs(twitterId);
    res.json({ contracts: cas });
  } catch (err) {
    log.error('CA fetch failed', { twitterId, err: err.message });
    res.status(500).json({ error: 'fetch_failed' });
  }
});

// ── Scan a Solana token address ──
router.get('/alpha/scan-token/:address', authenticateApiKey, async (req, res) => {
  const { address } = req.params;

  if (!address.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
    return res.status(400).json({ error: 'invalid_address' });
  }

  try {
    // Use DexScreener (free, no key)
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
    const dexData = await dexRes.json();

    const pair = dexData.pairs?.[0] || null;
    const tokenInfo = pair ? {
      name: pair.baseToken?.name,
      symbol: pair.baseToken?.symbol,
      price: pair.priceUsd,
      priceChange24h: pair.priceChange?.h24,
      volume24h: pair.volume?.h24,
      liquidity: pair.liquidity?.usd,
      marketCap: pair.marketCap,
      pairAddress: pair.pairAddress,
      dexId: pair.dexId,
      url: pair.url,
      createdAt: pair.pairCreatedAt,
    } : null;

    res.json({ address, token: tokenInfo, pairCount: dexData.pairs?.length || 0 });
  } catch (err) {
    log.error('Token scan failed', { address, err: err.message });
    res.status(502).json({ error: 'scan_failed', message: err.message });
  }
});

// ── Notes CRUD ──
router.get('/alpha/notes/:twitterId', authenticateApiKey, async (req, res) => {
  const note = await getNote(req.infinite.apiKey, req.params.twitterId);
  res.json({ note });
});

router.put('/alpha/notes/:twitterId', authenticateApiKey, async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text required' });
  if (text.length > 2000) return res.status(400).json({ error: 'text too long (max 2000)' });
  await setNote(req.infinite.apiKey, req.params.twitterId, text);
  res.json({ ok: true });
});

router.delete('/alpha/notes/:twitterId', authenticateApiKey, async (req, res) => {
  await deleteNote(req.infinite.apiKey, req.params.twitterId);
  res.json({ ok: true });
});

// ── Watchlist ──
router.get('/alpha/watchlist', authenticateApiKey, async (req, res) => {
  try {
    const profiles = await getWatchedProfiles(req.infinite.apiKey);
    res.json({ profiles });
  } catch (err) {
    log.error('Watchlist fetch failed', { err: err.message });
    res.status(500).json({ error: 'fetch_failed' });
  }
});

router.post('/alpha/watchlist', authenticateApiKey, async (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string') return res.status(400).json({ error: 'username required' });

  const cleanUsername = username.replace(/^@/, '').trim();

  try {
    let userId, userData;

    if (isSocialDataEnabled()) {
      const sdUser = await getUserProfile(cleanUsername);
      if (!sdUser) return res.status(404).json({ error: 'user_not_found' });
      const norm = normalizeUser(sdUser);
      userId = norm.twitterId;
      userData = { username: norm.username, displayName: norm.displayName, profileImage: norm.profileImage, bio: norm.bio, followers: Number(norm.followers) };
    } else {
      const token = await ensureValidTwitterToken(req.infinite.apiKey);
      if (!token) return res.status(401).json({ error: 'twitter_not_connected' });

      const data = await twitterGet(
        `/2/users/by/username/${encodeURIComponent(cleanUsername)}?user.fields=public_metrics,description,profile_image_url`,
        token,
      );
      if (!data.data) return res.status(404).json({ error: 'user_not_found' });

      userId = data.data.id;
      userData = {
        username: data.data.username,
        displayName: data.data.name,
        profileImage: data.data.profile_image_url || '',
        bio: data.data.description || '',
        followers: data.data.public_metrics?.followers_count || 0,
      };
    }

    await addWatchedProfile(req.infinite.apiKey, userId, userData);
    res.json({ ok: true, profile: { twitterId: userId, username: userData.username, displayName: userData.displayName } });
  } catch (err) {
    log.error('Watchlist add failed', { username: cleanUsername, err: err.message });
    res.status(502).json({ error: 'add_failed', message: err.message });
  }
});

router.delete('/alpha/watchlist/:twitterId', authenticateApiKey, async (req, res) => {
  try {
    await removeWatchedProfile(req.infinite.apiKey, req.params.twitterId);
    res.json({ ok: true });
  } catch (err) {
    log.error('Watchlist remove failed', { err: err.message });
    res.status(500).json({ error: 'remove_failed' });
  }
});

// ── Stats ──
router.get('/alpha/stats', authenticateApiKey, async (req, res) => {
  const keyProfileCount = await getKeyProfileCount();
  res.json({ keyProfileCount });
});

export default router;
