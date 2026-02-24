// Infinite Alpha — background data pipeline
// Uses SocialData.tools as primary data source (cheap), X API as fallback
import cron from 'node-cron';
import { logger } from './lib/logger.js';
import {
  getKeyProfiles, setKeyProfile, getProfile, setProfile,
  appendProfileHistory, addFollow, addToDiscover, updateTrending,
  addCA, addAlert, getCachedFollowingIds, setCachedFollowingIds,
  getFollowerCount,
} from './lib/kv-alpha.js';
import { emitDiscovery, emitAlert, emitCADetection, emitTrending } from './lib/socket.js';
import {
  isSocialDataEnabled, getUsersByUsernames, getUserFollowing,
  getUserTweets, normalizeUser,
} from './lib/socialdata.js';

const log = logger.child({ mod: 'alpha-pipeline' });
const TWITTER_API = 'https://api.twitter.com';
const SOLANA_CA_REGEX = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
const BATCH_DELAY_MS = 1500;

let bearerToken = null;
let creditsExhausted = false; // stop hammering when out of credits

function getBearerToken() {
  if (!bearerToken) bearerToken = process.env.TWITTER_BEARER_TOKEN || null;
  return bearerToken;
}

// X API fallback — only used if SocialData isn't configured
async function twitterGet(path) {
  const token = getBearerToken();
  if (!token) throw new Error('No bearer token');
  if (creditsExhausted) throw new Error('credits_depleted');

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
    throw new Error(`rate_limited:${waitSec}`);
  }
  if (res.status === 402) {
    creditsExhausted = true;
    log.error('X API credits depleted — switching to SocialData only');
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

const lastPollTimes = { follows: 0, profiles: 0, tweets: 0 };
const MIN_POLL_INTERVAL_MS = 55 * 60_000;

const useSD = () => isSocialDataEnabled();

// ── Job 1: Poll following lists ──
// SocialData cost: 17 profiles × ~200 users × $0.0002 = $0.68/run
// With hourly polling: ~$16/day (too much)
// Optimization: only fetch first page (~200), diff against cache

async function pollKeyProfileFollows() {
  if (Date.now() - lastPollTimes.follows < MIN_POLL_INTERVAL_MS) return;

  const keyProfiles = await getKeyProfiles();
  if (!keyProfiles.length) return;

  log.info('Polling follows', { count: keyProfiles.length, source: useSD() ? 'socialdata' : 'x-api' });
  let newFollowsTotal = 0;

  for (const kp of keyProfiles) {
    try {
      const twitterId = kp.twitterId;
      if (!twitterId) continue;

      let users = [];

      if (useSD()) {
        // SocialData: GET /twitter/friends/list — returns ~200 users per page
        const data = await getUserFollowing(twitterId);
        users = (data?.users || []).map(u => ({
          id: u.id_str || String(u.id),
          username: u.screen_name,
          name: u.name,
          description: u.description || '',
          profile_image_url: u.profile_image_url_https || '',
          public_metrics: {
            followers_count: u.followers_count || 0,
            following_count: u.friends_count || 0,
            tweet_count: u.statuses_count || 0,
          },
        }));
      } else {
        // X API fallback
        const data = await twitterGet(
          `/2/users/${twitterId}/following?max_results=100&user.fields=description,profile_image_url,public_metrics`,
        );
        users = (data.data || []).map(u => ({
          id: u.id,
          username: u.username,
          name: u.name,
          description: u.description || '',
          profile_image_url: u.profile_image_url || '',
          public_metrics: u.public_metrics || {},
        }));
      }

      const currentIds = users.map(u => u.id);
      const cachedIds = await getCachedFollowingIds(twitterId);
      const cachedSet = new Set(cachedIds);

      const newFollows = currentIds.filter(id => !cachedSet.has(id));

      if (newFollows.length && cachedIds.length > 0) {
        for (const followedId of newFollows) {
          const followedUser = users.find(u => u.id === followedId);
          if (!followedUser) continue;

          await addFollow(twitterId, followedId, Date.now());

          await setProfile(followedId, {
            username: followedUser.username,
            displayName: followedUser.name,
            bio: followedUser.description,
            profileImage: followedUser.profile_image_url,
            followers: String(followedUser.public_metrics?.followers_count || 0),
            following: String(followedUser.public_metrics?.following_count || 0),
            tweetCount: String(followedUser.public_metrics?.tweet_count || 0),
            createdAt: '',
            lastScanned: String(Date.now()),
          });

          const discoveryData = {
            username: followedUser.username,
            displayName: followedUser.name,
            bio: followedUser.description,
            profileImage: followedUser.profile_image_url,
            followers: followedUser.public_metrics?.followers_count || 0,
            followedBy: kp.username || twitterId,
            followedByCategory: kp.category || 'unknown',
          };

          await addToDiscover(followedId, discoveryData);
          emitDiscovery({ twitterId: followedId, ...discoveryData });
          newFollowsTotal++;
        }
      }

      const mergedIds = [...new Set([...currentIds, ...cachedIds])];
      await setCachedFollowingIds(twitterId, mergedIds);

      await sleep(BATCH_DELAY_MS);
    } catch (err) {
      if (err.message === 'credits_depleted') return;
      if (err.message.startsWith('rate_limited')) break;
      log.error('Follow poll failed', { id: kp.twitterId, err: err.message });
    }
  }

  lastPollTimes.follows = Date.now();
  if (newFollowsTotal) log.info('New follows detected', { count: newFollowsTotal });
}

// ── Job 2: Profile changes (renames, bio edits) ──
// SocialData cost: 1 batch call for 20 profiles = $0.004
// Runs every 4 hours = $0.024/day (basically free)

async function scanProfileChanges() {
  if (Date.now() - lastPollTimes.profiles < MIN_POLL_INTERVAL_MS * 3) return;

  const keyProfiles = await getKeyProfiles();
  if (!keyProfiles.length) return;

  try {
    let users = [];

    if (useSD()) {
      // SocialData: batch lookup by usernames
      const usernames = keyProfiles.map(kp => kp.username).filter(Boolean);
      const data = await getUsersByUsernames(usernames);
      users = (data?.users || []).map(u => ({
        id: u.id_str || String(u.id),
        username: u.screen_name,
        name: u.name,
        description: u.description || '',
        profile_image_url: u.profile_image_url_https || '',
        followers_count: u.followers_count || 0,
        following_count: u.friends_count || 0,
      }));
    } else {
      // X API fallback: batch /2/users
      const ids = keyProfiles.map(kp => kp.twitterId).filter(Boolean);
      const data = await twitterGet(
        `/2/users?ids=${ids.join(',')}&user.fields=description,profile_image_url,public_metrics`,
      );
      users = (data.data || []).map(u => ({
        id: u.id,
        username: u.username,
        name: u.name,
        description: u.description || '',
        profile_image_url: u.profile_image_url || '',
        followers_count: u.public_metrics?.followers_count || 0,
        following_count: u.public_metrics?.following_count || 0,
      }));
    }

    for (const user of users) {
      const cached = await getProfile(user.id);
      if (!cached) continue;

      if (cached.username && cached.username !== user.username) {
        await appendProfileHistory(user.id, { type: 'rename', from: cached.username, to: user.username });
        const alertData = { type: 'rename', from: cached.username, to: user.username };
        await addAlert(user.id, alertData);
        emitAlert(user.id, alertData);
        log.info('Rename detected', { from: cached.username, to: user.username });
      }

      if (cached.bio && cached.bio !== user.description) {
        const alertData = { type: 'bio_change', from: cached.bio, to: user.description };
        await addAlert(user.id, alertData);
        emitAlert(user.id, alertData);
      }

      await setProfile(user.id, {
        ...cached,
        username: user.username,
        displayName: user.name,
        bio: user.description,
        profileImage: user.profile_image_url,
        followers: String(user.followers_count),
        following: String(user.following_count),
        lastScanned: String(Date.now()),
      });
    }

    lastPollTimes.profiles = Date.now();
    log.info('Profile scan complete', { checked: users.length });
  } catch (err) {
    if (err.message === 'credits_depleted') return;
    log.error('Profile scan failed', { err: err.message });
  }
}

// ── Job 3: CA detection in tweets ──
// SocialData cost: ~12 alpha profiles × ~20 tweets = $0.048/run
// Runs every 60 min = ~$1.15/day

async function detectCATweets() {
  if (Date.now() - lastPollTimes.tweets < MIN_POLL_INTERVAL_MS) return;

  const keyProfiles = await getKeyProfiles();
  const alphaProfiles = keyProfiles.filter(kp =>
    ['alpha', 'founder'].includes(kp.category),
  );

  for (const kp of alphaProfiles) {
    try {
      const twitterId = kp.twitterId;
      if (!twitterId) continue;

      let tweets = [];

      if (useSD()) {
        // SocialData: returns ~20 tweets per page
        const data = await getUserTweets(twitterId);
        tweets = (data?.tweets || data?.data || []).map(t => ({
          id: t.id_str || t.id,
          text: t.full_text || t.text || '',
        }));
      } else {
        const data = await twitterGet(
          `/2/users/${twitterId}/tweets?max_results=5&exclude=retweets`,
        );
        tweets = (data.data || []).map(t => ({ id: t.id, text: t.text || '' }));
      }

      for (const tweet of tweets) {
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
      log.error('CA scan failed', { id: kp.twitterId, err: err.message });
    }
  }

  lastPollTimes.tweets = Date.now();
}

// ── Job 4: Compute trending (no API calls) ──

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
  log.info('Seeding key profiles...');
  const categoryMap = new Map(SEED_KEY_PROFILES.map(kp => [kp.username.toLowerCase(), kp.category]));
  const usernames = SEED_KEY_PROFILES.map(kp => kp.username);

  try {
    let users = [];

    if (useSD()) {
      // SocialData: 1 batch call = $0.004
      const data = await getUsersByUsernames(usernames);
      users = (data?.users || []).map(u => ({
        id: u.id_str || String(u.id),
        username: u.screen_name,
        name: u.name,
        description: u.description || '',
        profile_image_url: u.profile_image_url_https || '',
        followers_count: u.followers_count || 0,
        following_count: u.friends_count || 0,
        tweet_count: u.statuses_count || 0,
      }));
    } else {
      // X API: 1 batch call
      const data = await twitterGet(
        `/2/users/by?usernames=${usernames.join(',')}&user.fields=public_metrics,description,profile_image_url`,
      );
      users = (data.data || []).map(u => ({
        id: u.id,
        username: u.username,
        name: u.name,
        description: u.description || '',
        profile_image_url: u.profile_image_url || '',
        followers_count: u.public_metrics?.followers_count || 0,
        following_count: u.public_metrics?.following_count || 0,
        tweet_count: u.public_metrics?.tweet_count || 0,
      }));
    }

    for (const user of users) {
      const category = categoryMap.get(user.username.toLowerCase()) || 'alpha';
      await setKeyProfile(user.id, {
        username: user.username,
        displayName: user.name,
        category,
        followers: String(user.followers_count),
        profileImage: user.profile_image_url,
        addedAt: String(Date.now()),
      });
      await setProfile(user.id, {
        username: user.username,
        displayName: user.name,
        bio: user.description,
        profileImage: user.profile_image_url,
        followers: String(user.followers_count),
        following: String(user.following_count),
        tweetCount: String(user.tweet_count),
        createdAt: '',
        lastScanned: String(Date.now()),
      });
    }

    log.info('Key profiles seeded', { count: users.length });
  } catch (err) {
    log.error('Seed failed', { err: err.message });
  }
}

// ── Bootstrap ──

export async function bootstrapAlphaPipeline() {
  const hasSD = isSocialDataEnabled();
  const hasXApi = !!getBearerToken();

  log.info('Alpha pipeline starting...', {
    socialdata: hasSD,
    xapi: hasXApi,
    primary: hasSD ? 'socialdata' : hasXApi ? 'x-api' : 'none',
  });

  if (!hasSD && !hasXApi) {
    log.warn('No data source configured. Set SOCIALDATA_API_KEY (preferred) or TWITTER_BEARER_TOKEN.');
    return;
  }

  // Seed on first run (1 API call)
  const profiles = await getKeyProfiles();
  if (profiles.length === 0) {
    await seedKeyProfiles();
  }

  // Compute trending from cache (free)
  setTimeout(() => computeTrending().catch(() => {}), 5_000);

  // ── Cron schedule ──
  // Follows: every 60 min (17 API calls × ~200 users each)
  cron.schedule('3 * * * *', async () => {
    try { await pollKeyProfileFollows(); }
    catch (err) { log.error('pollKeyProfileFollows failed', { err: err.message }); }
  });

  // Profile changes: every 4 hours (1 batch API call)
  cron.schedule('15 */4 * * *', async () => {
    try { await scanProfileChanges(); }
    catch (err) { log.error('scanProfileChanges failed', { err: err.message }); }
  });

  // CA detection: every 60 min (only alpha callers)
  cron.schedule('33 * * * *', async () => {
    try { await detectCATweets(); }
    catch (err) { log.error('detectCATweets failed', { err: err.message }); }
  });

  // Trending: every 30 min (no API calls)
  cron.schedule('*/30 * * * *', async () => {
    try { await computeTrending(); }
    catch (err) { log.error('computeTrending failed', { err: err.message }); }
  });

  log.info('Alpha pipeline scheduled', { primary: hasSD ? 'socialdata' : 'x-api' });
}
