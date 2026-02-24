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
const BATCH_DELAY_MS = 1200; // delay between API calls to avoid rate limits

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
    const waitSec = reset ? Math.max(0, Number(reset) - Math.floor(Date.now() / 1000)) : 60;
    log.warn('Twitter rate limited', { path: path.slice(0, 60), waitSec });
    throw new Error(`rate_limited:${waitSec}`);
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

// ── Job 1: Poll key profile following lists, detect new follows ──

async function pollKeyProfileFollows() {
  const token = getBearerToken();
  if (!token) return;

  const keyProfiles = await getKeyProfiles();
  if (!keyProfiles.length) {
    log.debug('No key profiles to poll');
    return;
  }

  log.info('Polling key profile follows', { count: keyProfiles.length });
  let newFollowsTotal = 0;

  // Process in batches to stay under rate limits
  // Twitter API v2: 15 requests/15 min for /2/users/:id/following (app auth)
  const batchSize = 5;

  for (let i = 0; i < keyProfiles.length; i += batchSize) {
    const batch = keyProfiles.slice(i, i + batchSize);

    for (const kp of batch) {
      try {
        const twitterId = kp.twitterId;
        if (!twitterId) continue;

        // Get current following list (first page, 1000 max)
        const data = await twitterGet(
          `/2/users/${twitterId}/following?max_results=200&user.fields=public_metrics,description,profile_image_url,created_at`,
        );

        const currentIds = (data.data || []).map(u => u.id);
        const cachedIds = await getCachedFollowingIds(twitterId);
        const cachedSet = new Set(cachedIds);

        // Detect new follows (IDs in current but not in cached)
        const newFollows = currentIds.filter(id => !cachedSet.has(id));

        if (newFollows.length && cachedIds.length > 0) {
          // Only emit discoveries after the first sync (cachedIds > 0 means we've seen this before)
          for (const followedId of newFollows) {
            const followedUser = (data.data || []).find(u => u.id === followedId);
            if (!followedUser) continue;

            // Store the follow relationship
            await addFollow(twitterId, followedId, Date.now());

            // Cache the followed profile
            await setProfile(followedId, {
              username: followedUser.username,
              displayName: followedUser.name,
              bio: followedUser.description || '',
              profileImage: followedUser.profile_image_url || '',
              followers: String(followedUser.public_metrics?.followers_count || 0),
              following: String(followedUser.public_metrics?.following_count || 0),
              tweetCount: String(followedUser.public_metrics?.tweet_count || 0),
              createdAt: followedUser.created_at || '',
              lastScanned: String(Date.now()),
            });

            // Add to discover feed
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

        // Update cached snapshot
        await setCachedFollowingIds(twitterId, currentIds);

        await sleep(BATCH_DELAY_MS);
      } catch (err) {
        if (err.message.startsWith('rate_limited')) {
          log.warn('Rate limited during follows poll, pausing batch');
          await sleep(60_000);
          break;
        }
        log.error('Follow poll failed for key profile', { id: kp.twitterId, err: err.message });
      }
    }

    // Pause between batches
    if (i + batchSize < keyProfiles.length) {
      await sleep(BATCH_DELAY_MS * 3);
    }
  }

  if (newFollowsTotal) {
    log.info('New follows detected', { count: newFollowsTotal });
  }
}

// ── Job 2: Scan recent discoveries for profile changes (renames, bio edits) ──

async function scanProfileChanges() {
  const token = getBearerToken();
  if (!token) return;

  const keyProfiles = await getKeyProfiles();

  for (const kp of keyProfiles) {
    try {
      const twitterId = kp.twitterId;
      const cached = await getProfile(twitterId);
      if (!cached) continue;

      const data = await twitterGet(
        `/2/users/${twitterId}?user.fields=public_metrics,description,profile_image_url`,
      );
      const user = data.data;
      if (!user) continue;

      // Detect username change
      if (cached.username && cached.username !== user.username) {
        await appendProfileHistory(twitterId, {
          type: 'rename',
          from: cached.username,
          to: user.username,
        });
        const alertData = { type: 'rename', from: cached.username, to: user.username };
        await addAlert(twitterId, alertData);
        emitAlert(twitterId, alertData);
        log.info('Rename detected', { twitterId, from: cached.username, to: user.username });
      }

      // Detect bio change
      if (cached.bio && cached.bio !== (user.description || '')) {
        const alertData = { type: 'bio_change', from: cached.bio, to: user.description || '' };
        await addAlert(twitterId, alertData);
        emitAlert(twitterId, alertData);
      }

      // Update cache
      await setProfile(twitterId, {
        ...cached,
        username: user.username,
        displayName: user.name,
        bio: user.description || '',
        profileImage: user.profile_image_url || '',
        followers: String(user.public_metrics?.followers_count || 0),
        following: String(user.public_metrics?.following_count || 0),
        lastScanned: String(Date.now()),
      });

      await sleep(BATCH_DELAY_MS);
    } catch (err) {
      if (err.message.startsWith('rate_limited')) break;
      log.error('Profile scan failed', { id: kp.twitterId, err: err.message });
    }
  }
}

// ── Job 3: Detect contract addresses in tweets ──

async function detectCATweets() {
  const token = getBearerToken();
  if (!token) return;

  const keyProfiles = await getKeyProfiles();

  for (const kp of keyProfiles) {
    try {
      const twitterId = kp.twitterId;
      if (!twitterId) continue;

      const data = await twitterGet(
        `/2/users/${twitterId}/tweets?max_results=10&tweet.fields=created_at,text&exclude=retweets`,
      );

      for (const tweet of data.data || []) {
        const matches = tweet.text.match(SOLANA_CA_REGEX) || [];
        for (const ca of matches) {
          // Basic validation: Solana addresses are 32-44 chars base58
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
      if (err.message.startsWith('rate_limited')) break;
      log.error('CA detection failed', { id: kp.twitterId, err: err.message });
    }
  }
}

// ── Job 4: Compute trending scores ──

async function computeTrending() {
  const keyProfiles = await getKeyProfiles();
  if (!keyProfiles.length) return;

  // Build a map of childId -> number of key profiles that follow them (from recent follows)
  const scoreMap = new Map();

  for (const kp of keyProfiles) {
    try {
      const follows = await getCachedFollowingIds(kp.twitterId);
      for (const childId of follows) {
        scoreMap.set(childId, (scoreMap.get(childId) || 0) + 1);
      }
    } catch { /* skip */ }
  }

  // Update trending sorted set
  for (const [childId, score] of scoreMap) {
    if (score < 2) continue; // need at least 2 key profiles following
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

// Seed list — real Twitter handles for key CT profiles
// Add more via admin endpoint or by extending this list
const SEED_KEY_PROFILES = [
  // VCs & Funds
  { username: 'a16zcrypto', category: 'vc' },
  { username: 'paradigm', category: 'vc' },
  { username: 'DelpDigital', category: 'research' },
  { username: 'MessariCrypto', category: 'research' },
  // Solana ecosystem
  { username: 'rajgokal', category: 'founder' },
  { username: 'JupiterExchange', category: 'protocol' },
  { username: 'RaydiumProtocol', category: 'protocol' },
  // Alpha callers & traders
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
  let seeded = 0;

  for (const kp of SEED_KEY_PROFILES) {
    try {
      // Resolve Twitter ID
      const data = await twitterGet(
        `/2/users/by/username/${kp.username}?user.fields=public_metrics,description,profile_image_url`,
      );
      if (!data.data) continue;

      const user = data.data;
      await setKeyProfile(user.id, {
        username: user.username,
        displayName: user.name,
        category: kp.category,
        followers: String(user.public_metrics?.followers_count || 0),
        profileImage: user.profile_image_url || '',
        addedAt: String(Date.now()),
      });

      // Also cache as regular profile
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
      await sleep(BATCH_DELAY_MS);
    } catch (err) {
      if (err.message.startsWith('rate_limited')) {
        log.warn('Rate limited during seeding, will resume next cycle');
        break;
      }
      log.warn('Failed to seed key profile', { username: kp.username, err: err.message });
    }
  }

  log.info('Key profiles seeded', { count: seeded });
}

// ── Bootstrap ──

export async function bootstrapAlphaPipeline() {
  log.info('Alpha pipeline starting...');

  if (!getBearerToken()) {
    log.warn('TWITTER_BEARER_TOKEN not set — alpha pipeline disabled. Set it to enable CT scanning.');
    return;
  }

  // Seed key profiles on first run
  const profiles = await getKeyProfiles();
  if (profiles.length === 0) {
    await seedKeyProfiles();
  }

  // Run first cycle immediately (don't wait for cron)
  log.info('Running initial pipeline cycle...');
  setTimeout(async () => {
    try {
      await pollKeyProfileFollows();
      log.info('Initial follows poll complete');
    } catch (err) { log.error('Initial follows poll failed', { err: err.message }); }

    try {
      await detectCATweets();
      log.info('Initial CA scan complete');
    } catch (err) { log.error('Initial CA scan failed', { err: err.message }); }

    try {
      await computeTrending();
      log.info('Initial trending compute complete');
    } catch (err) { log.error('Initial trending compute failed', { err: err.message }); }
  }, 5_000); // 5s delay to let server fully start

  // Schedule recurring crons
  cron.schedule('*/5 * * * *', async () => {
    try { await pollKeyProfileFollows(); }
    catch (err) { log.error('pollKeyProfileFollows crashed', { err: err.message }); }
  });

  cron.schedule('*/15 * * * *', async () => {
    try { await scanProfileChanges(); }
    catch (err) { log.error('scanProfileChanges crashed', { err: err.message }); }
  });

  cron.schedule('2,7,12,17,22,27,32,37,42,47,52,57 * * * *', async () => {
    try { await detectCATweets(); }
    catch (err) { log.error('detectCATweets crashed', { err: err.message }); }
  });

  cron.schedule('*/10 * * * *', async () => {
    try { await computeTrending(); }
    catch (err) { log.error('computeTrending crashed', { err: err.message }); }
  });

  log.info('Alpha pipeline cron jobs scheduled');
}
