import { config } from 'dotenv';
config();

import { initWatchlist, pollWatchlist, searchEngagement } from './handlers/engagement.js';
import { getBotUserId } from './lib/twitter.js';

const mode = process.argv[2] || '--watch';

await getBotUserId();
await initWatchlist();

if (mode === '--search') {
  await searchEngagement();
} else {
  await pollWatchlist();
}
