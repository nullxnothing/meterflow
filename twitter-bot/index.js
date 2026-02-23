import { createServer } from 'http';
import cron from 'node-cron';
import { CFG, LIMITS } from './config.js';
import { getBotUserId } from './lib/twitter.js';
import { getStats } from './lib/state.js';
import { initWatchlist, pollWatchlist, searchEngagement } from './handlers/engagement.js';

let isReady = false;
let lastWatchlistPoll = null;
let lastSearch = null;

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

  // Secondary: keyword search every 30 min
  cron.schedule(LIMITS.SEARCH_CRON, async () => {
    try {
      await searchEngagement();
      lastSearch = new Date().toISOString();
    } catch (err) {
      console.error('[BOT] Search error:', err.message);
    }
  });

  console.log(`[BOT] Watchlist polling: ${LIMITS.WATCHLIST_POLL_CRON}`);
  console.log(`[BOT] Search engagement: ${LIMITS.SEARCH_CRON}`);
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
