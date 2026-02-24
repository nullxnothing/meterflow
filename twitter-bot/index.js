import { createServer } from 'http';
import cron from 'node-cron';
import { CFG, LIMITS } from './config.js';
import { getBotUserId } from './lib/twitter.js';
import { getStats } from './lib/state.js';
import { initWatchlist, pollWatchlist, searchEngagement, getResolvedWatchlist } from './handlers/engagement.js';
import { runWarmup } from './handlers/warmup.js';

let isReady = false;
let lastWatchlistPoll = null;
let lastSearch = null;
let lastWarmup = null;
let isWarmingUp = false;

// Peak CT hours (UTC) — warmup runs 15 min before these
const PEAK_HOURS = [13, 17, 21, 23];

function isPrePeakWindow() {
  const now = new Date();
  const hour = now.getUTCHours();
  const min = now.getUTCMinutes();
  // Trigger warmup at :40-:50 of the hour before peak
  return PEAK_HOURS.some(peak => {
    const warmupHour = peak === 0 ? 23 : peak - 1;
    return hour === warmupHour && min >= 40 && min <= 55;
  });
}

async function maybeWarmup() {
  if (isWarmingUp) return;
  if (!isPrePeakWindow()) return;

  // Only warmup once per peak window
  if (lastWarmup) {
    const sinceLast = Date.now() - new Date(lastWarmup).getTime();
    if (sinceLast < 60 * 60 * 1000) return; // skip if warmed up <1h ago
  }

  isWarmingUp = true;
  try {
    const watchlist = getResolvedWatchlist();
    if (watchlist.length === 0) {
      console.log('[WARMUP] No watchlist resolved yet — skipping');
      return;
    }
    await runWarmup(watchlist);
    lastWarmup = new Date().toISOString();
  } catch (err) {
    console.error('[BOT] Warmup error:', err.message);
  } finally {
    isWarmingUp = false;
  }
}

async function init() {
  try {
    await getBotUserId();
    isReady = true;
    console.log('[BOT] Twitter bot initialized');
  } catch (err) {
    console.error('[FATAL] Failed to authenticate with Twitter:', err.message);
    process.exit(1);
  }

  // Resolve watchlist usernames to IDs
  await initWatchlist();

  // Run both immediately on startup
  try {
    await pollWatchlist();
    lastWatchlistPoll = new Date().toISOString();
  } catch (err) {
    console.error('[BOT] Initial watchlist poll error:', err.message);
  }

  try {
    await searchEngagement();
    lastSearch = new Date().toISOString();
  } catch (err) {
    console.error('[BOT] Initial search error:', err.message);
  }

  // Primary: poll watchlist every 5 min
  cron.schedule(LIMITS.WATCHLIST_POLL_CRON, async () => {
    try {
      await pollWatchlist();
      lastWatchlistPoll = new Date().toISOString();
    } catch (err) {
      console.error('[BOT] Watchlist poll error:', err.message);
    }
  });

  // Secondary: keyword search every 15 min
  cron.schedule(LIMITS.SEARCH_CRON, async () => {
    try {
      await searchEngagement();
      lastSearch = new Date().toISOString();
    } catch (err) {
      console.error('[BOT] Search error:', err.message);
    }
  });

  // Warmup check every 5 min — triggers before peak CT hours
  cron.schedule('*/5 * * * *', () => {
    maybeWarmup().catch(err => console.error('[BOT] Warmup check error:', err.message));
  });

  console.log(`[BOT] Watchlist polling: ${LIMITS.WATCHLIST_POLL_CRON}`);
  console.log(`[BOT] Search engagement: ${LIMITS.SEARCH_CRON}`);
  console.log(`[BOT] Warmup before peak hours: ${PEAK_HOURS.map(h => `${h}:00 UTC`).join(', ')}`);
}

const health = createServer(async (req, res) => {
  if (req.url === '/health') {
    const stats = await getStats().catch(() => ({}));
    const status = isReady ? 200 : 503;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: isReady ? 'ok' : 'starting',
      dryRun: CFG.DRY_RUN,
      uptime: process.uptime(),
      lastWatchlistPoll,
      lastSearch,
      ...stats,
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

health.listen(CFG.HEALTH_PORT, () => {
  console.log(`[HEALTH] Listening on :${CFG.HEALTH_PORT}`);
});

init();
