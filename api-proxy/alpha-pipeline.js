// Infinite Alpha — background data pipeline
// Polls Twitter API for key profile activity, detects new follows, CAs, renames
import cron from 'node-cron';
import { logger } from './lib/logger.js';
import {
  getKeyProfiles, setKeyProfile, getProfile, setProfile,
  appendProfileHistory, addFollow, addToDiscover, updateTrending,
  addCA, addAlert, getCachedFollowingIds, setCachedFollowingIds,
  getFollowerCount,
} from './lib/kv-alpha.js';
import { emitDiscovery, emitAlert, emitCADetection, emitTrending } from './lib/socket.js';

const log = logger.child({ mod: 'alpha-pipeline' });
const TWITTER_API = 'https://api.twitter.com';
const SOLANA_CA_REGEX = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
const BATCH_DELAY_MS = 1500;

let bearerToken = null;

function getBearerToken() {
  if (!bearerToken) {
    bearerToken = process.env.TWITTER_BEARER_TOKEN;
    if (!bearerToken) {
      log.warn('TWITTER_BEARER_TOKEN not set — alpha pipeline will be disabled');
    }
  }
  return bearerToken;
}

async function twitterGet(path) {
  const token = getBearerToken();
  if (!token) throw new Error('No bearer token');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  const res = await fetch(`${TWITTER_API}${path}`, {
    signal: ctrl.signal,
    headers: { 'Authorization': `Bearer ${token}` },
  });
  clearTimeout(timer);

  if (res.status === 429) {
    const reset = res.headers.get('x-rate-limit-reset');
    const waitSec = reset ? Math.max(0, Number(reset) - Math.floor(Date.now() / 1000)) : 900;
    log.warn('Twitter rate limited', { path: path.slice(0, 60), waitSec });
    throw new Error(`rate_limited:${waitSec}`);
  }

  if (res.status === 402) {
    log.error('Twitter API credits depleted — pausing pipeline');
    throw new Error('credits_depleted');
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`X API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Track last poll times to avoid redundant work on restarts
const lastPollTimes = {
  follows: 0,
  profiles: 0,
  tweets: 0,
};

const MIN_POLL_INTERVAL_MS = 55 * 60_000; // Don't re-poll within 55 min

// ── Job 1: Poll key profile following lists, detect new follows ──
// Runs every 60 min — 17 API calls per cycle
// Uses max_results=100 (only need recent follows) and minimal fields

async function pollKeyProfileFollows() {
  const token = getBearerToken();
  if (!token) return;

  if (Date.now() - lastPollTimes.follows < MIN_POLL_INTERVAL_MS) {
    log.debug('Skipping follows poll — too recent');
    return;
  }

  const keyProfiles = await getKeyProfiles();
  if (!keyProfiles.length) return;

  log.info('Polling key profile follows', { count: keyProfiles.length });
  let newFollowsTotal = 0;

  for (const kp of keyProfiles) {
    try {
      const twitterId = kp.twitterId;
      if (!twitterId) continue;

      // Only fetch 100 recent follows with minimal fields to save credits
      const data = await twitterGet(
        `/2/users/${twitterId}/following?max_results=100&user.fields=description,profile_image_url,public_metrics`,
      );

      const currentIds = (data.data || []).map(u => u.id);
      const cachedIds = await getCachedFollowingIds(twitterId);
      const cachedSet = new Set(cachedIds);

      // Detect new follows
      const newFollows = currentIds.filter(id => !cachedSet.has(id));

      if (newFollows.length && cachedIds.length > 0) {
        for (const followedId of newFollows) {
          const followedUser = (data.data || []).find(u => u.id === followedId);
          if (!followedUser) continue;

          await addFollow(twitterId, followedId, Date.now());

          await setProfile(followedId, {
            username: followedUser.username,
            displayName: followedUser.name,
            bio: followedUser.description || '',
            profileImage: followedUser.profile_image_url || '',
            followers: String(followedUser.public_metrics?.followers_count || 0),
            following: String(followedUser.public_metrics?.following_count || 0),
            tweetCount: String(followedUser.public_metrics?.tweet_count || 0),
            createdAt: '',
            lastScanned: String(Date.now()),
          });

          const discoveryData = {
            username: followedUser.username,
            displayName: followedUser.name,
            bio: followedUser.description || '',
            profileImage: followedUser.profile_image_url || '',
            followers: followedUser.public_metrics?.followers_count || 0,
            followedBy: kp.username || twitterId,
            followedByCategory: kp.category || 'unknown',
          };

          await addToDiscover(followedId, discoveryData);
          emitDiscovery({ twitterId: followedId, ...discoveryData });
          newFollowsTotal++;
        }
      }

      // Merge with existing cache (don't lose old IDs)
      const mergedIds = [...new Set([...currentIds, ...cachedIds])];
      await setCachedFollowingIds(twitterId, mergedIds);

      await sleep(BATCH_DELAY_MS);
    } catch (err) {
      if (err.message === 'credits_depleted') return;
      if (err.message.startsWith('rate_limited')) {
        log.warn('Rate limited during follows poll, stopping');
        break;
      }
      log.error('Follow poll failed', { id: kp.twitterId, err: err.message });
    }
  }

  lastPollTimes.follows = Date.now();
  if (newFollowsTotal) log.info('New follows detected', { count: newFollowsTotal });
}

// ── Job 2: Scan key profiles for renames/bio changes ──
// Runs every 4 hours — uses batch lookup (1 call per 100 users)

async function scanProfileChanges() {
  const token = getBearerToken();
  if (!token) return;

  if (Date.now() - lastPollTimes.profiles < MIN_POLL_INTERVAL_MS * 3) {
    log.debug('Skipping profile scan — too recent');
    return;
  }

  const keyProfiles = await getKeyProfiles();
  if (!keyProfiles.length) return;

  // Batch lookup: /2/users accepts up to 100 IDs in one call
  const ids = keyProfiles.map(kp => kp.twitterId).filter(Boolean);
  if (!ids.length) return;

  try {
    const data = await twitterGet(
      `/2/users?ids=${ids.join(',')}&user.fields=description,profile_image_url,public_metrics`,
    );

    for (const user of data.data || []) {
      const cached = await getProfile(user.id);
      if (!cached) continue;

      if (cached.username && cached.username !== user.username) {
        await appendProfileHistory(user.id, { type: 'rename', from: cached.username, to: user.username });
        const alertData = { type: 'rename', from: cached.username, to: user.username };
        await addAlert(user.id, alertData);
        emitAlert(user.id, alertData);
        log.info('Rename detected', { from: cached.username, to: user.username });
      }

      if (cached.bio && cached.bio !== (user.description || '')) {
        const alertData = { type: 'bio_change', from: cached.bio, to: user.description || '' };
        await addAlert(user.id, alertData);
        emitAlert(user.id, alertData);
      }

      await setProfile(user.id, {
        ...cached,
        username: user.username,
        displayName: user.name,
        bio: user.description || '',
        profileImage: user.profile_image_url || '',
        followers: String(user.public_metrics?.followers_count || 0),
        following: String(user.public_metrics?.following_count || 0),
        lastScanned: String(Date.now()),
      });
    }

    lastPollTimes.profiles = Date.now();
    log.info('Profile change scan complete', { checked: ids.length });
  } catch (err) {
    if (err.message === 'credits_depleted') return;
    log.error('Profile change scan failed', { err: err.message });
  }
}

// ── Job 3: Detect contract addresses in tweets ──
// Runs every 60 min — only scans alpha callers (not VCs/protocols)

async function detectCATweets() {
  const token = getBearerToken();
  if (!token) return;

  if (Date.now() - lastPollTimes.tweets < MIN_POLL_INTERVAL_MS) {
    log.debug('Skipping CA scan — too recent');
    return;
  }

  const keyProfiles = await getKeyProfiles();
  // Only scan alpha callers for CAs (VCs/protocols rarely post CAs)
  const alphaProfiles = keyProfiles.filter(kp =>
    ['alpha', 'founder'].includes(kp.category)
  );

  for (const kp of alphaProfiles) {
    try {
      const twitterId = kp.twitterId;
      if (!twitterId) continue;

      // Only 5 recent tweets, minimal fields
      const data = await twitterGet(
        `/2/users/${twitterId}/tweets?max_results=5&exclude=retweets`,
      );

      for (const tweet of data.data || []) {
        const matches = tweet.text.match(SOLANA_CA_REGEX) || [];
        for (const ca of matches) {
          if (ca.length < 32 || ca.length > 44) continue;

          const caData = {
            contractAddress: ca,
            chain: 'solana',
            tweetId: tweet.id,
            tweetText: tweet.text.slice(0, 280),
            postedBy: kp.username || twitterId,
          };

          await addCA(twitterId, caData);
          emitCADetection(twitterId, caData);
          log.info('CA detected', { ca: ca.slice(0, 12) + '...', from: kp.username });
        }
      }

      await sleep(BATCH_DELAY_MS);
    } catch (err) {
      if (err.message === 'credits_depleted') return;
      if (err.message.startsWith('rate_limited')) break;
      log.error('CA detection failed', { id: kp.twitterId, err: err.message });
    }
  }

  lastPollTimes.tweets = Date.now();
}

// ── Job 4: Compute trending scores (no API calls) ──

async function computeTrending() {
  const keyProfiles = await getKeyProfiles();
  if (!keyProfiles.length) return;

  const scoreMap = new Map();

  for (const kp of keyProfiles) {
    try {
      const follows = await getCachedFollowingIds(kp.twitterId);
      for (const childId of follows) {
        scoreMap.set(childId, (scoreMap.get(childId) || 0) + 1);
      }
    } catch { /* skip */ }
  }

  for (const [childId, score] of scoreMap) {
    if (score < 2) continue;
    const profile = await getProfile(childId);
    if (!profile) continue;

    await updateTrending(childId, score, {
      username: profile.username,
      displayName: profile.displayName,
      bio: profile.bio,
      profileImage: profile.profileImage,
      followers: profile.followers,
    });
  }

  log.debug('Trending computed', { projects: scoreMap.size });
}

// ── Seed key profiles ──
// Uses batch lookup: 1 API call for all 20 usernames

const SEED_KEY_PROFILES = [
  { username: 'a16zcrypto', category: 'vc' },
  { username: 'paradigm', category: 'vc' },
  { username: 'DelpDigital', category: 'research' },
  { username: 'MessariCrypto', category: 'research' },
  { username: 'rajgokal', category: 'founder' },
  { username: 'JupiterExchange', category: 'protocol' },
  { username: 'RaydiumProtocol', category: 'protocol' },
  { username: 'blknoiz06', category: 'alpha' },
  { username: 'MustStopMurad', category: 'alpha' },
  { username: 'inversebrah', category: 'alpha' },
  { username: 'DefiIgnas', category: 'alpha' },
  { username: 'Route2FI', category: 'alpha' },
  { username: 'TheDeFISaint', category: 'alpha' },
  { username: 'HsakaTrades', category: 'alpha' },
  { username: 'CryptoGodJohn', category: 'alpha' },
  { username: 'Pentosh1', category: 'alpha' },
  { username: 'SolJakey', category: 'alpha' },
  { username: 'loomdart', category: 'alpha' },
  { username: 'crashiusclay69', category: 'alpha' },
  { username: 'notthreadguy', category: 'alpha' },
];

async function seedKeyProfiles() {
  const token = getBearerToken();
  if (!token) return;

  log.info('Seeding key profiles...');

  // Build category map for lookup after batch call
  const categoryMap = new Map(SEED_KEY_PROFILES.map(kp => [kp.username.toLowerCase(), kp.category]));

  // Batch lookup: /2/users/by accepts up to 100 usernames in 1 call
  const usernames = SEED_KEY_PROFILES.map(kp => kp.username).join(',');
  try {
    const data = await twitterGet(
      `/2/users/by?usernames=${usernames}&user.fields=public_metrics,description,profile_image_url`,
    );

    let seeded = 0;
    for (const user of data.data || []) {
      const category = categoryMap.get(user.username.toLowerCase()) || 'alpha';

      await setKeyProfile(user.id, {
        username: user.username,
        displayName: user.name,
        category,
        followers: String(user.public_metrics?.followers_count || 0),
        profileImage: user.profile_image_url || '',
        addedAt: String(Date.now()),
      });

      await setProfile(user.id, {
        username: user.username,
        displayName: user.name,
        bio: user.description || '',
        profileImage: user.profile_image_url || '',
        followers: String(user.public_metrics?.followers_count || 0),
        following: String(user.public_metrics?.following_count || 0),
        tweetCount: String(user.public_metrics?.tweet_count || 0),
        createdAt: '',
        lastScanned: String(Date.now()),
      });

      seeded++;
    }

    log.info('Key profiles seeded', { count: seeded, errors: data.errors?.length || 0 });
  } catch (err) {
    log.error('Batch seed failed', { err: err.message });
  }
}

// ── Bootstrap ──

export async function bootstrapAlphaPipeline() {
  log.info('Alpha pipeline starting...');

  if (!getBearerToken()) {
    log.warn('TWITTER_BEARER_TOKEN not set — alpha pipeline disabled.');
    return;
  }

  // Seed key profiles on first run (1 API call)
  const profiles = await getKeyProfiles();
  if (profiles.length === 0) {
    await seedKeyProfiles();
  }

  // DON'T run immediate cycle on boot — wait for cron.
  // This prevents burning credits on every deploy/restart.
  log.info('Pipeline will begin polling on next cron tick.');

  // Compute trending from cached data (no API calls)
  setTimeout(() => computeTrending().catch(() => {}), 5_000);

  // ── Cron schedule (conservative) ──

  // Follows poll: every 60 min (17 API calls/cycle)
  cron.schedule('3 * * * *', async () => {
    try { await pollKeyProfileFollows(); }
    catch (err) { log.error('pollKeyProfileFollows failed', { err: err.message }); }
  });

  // Profile change scan: every 4 hours (1 batch API call)
  cron.schedule('15 */4 * * *', async () => {
    try { await scanProfileChanges(); }
    catch (err) { log.error('scanProfileChanges failed', { err: err.message }); }
  });

  // CA detection: every 60 min, offset (only alpha callers ~12 calls)
  cron.schedule('33 * * * *', async () => {
    try { await detectCATweets(); }
    catch (err) { log.error('detectCATweets failed', { err: err.message }); }
  });

  // Trending: every 30 min (no API calls — reads from cache)
  cron.schedule('*/30 * * * *', async () => {
    try { await computeTrending(); }
    catch (err) { log.error('computeTrending failed', { err: err.message }); }
  });

  log.info('Alpha pipeline cron jobs scheduled (conservative mode)');
}
