import { SPAM, BOT_CONFIG } from '../config.js';

const recentMessages = new Map();
const rateCounts = new Map();
const strikeMap = new Map();

const ESCALATION = [
  null,                        // 1st: delete only
  5 * 60 * 1000,               // 2nd: 5min timeout
  60 * 60 * 1000,              // 3rd: 1hr timeout
  'ban',                       // 4th: ban
];

function extractLinks(text) {
  const urlRegex = /https?:\/\/[^\s<>]+/gi;
  return text.match(urlRegex) || [];
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function checkPatterns(content) {
  return SPAM.PATTERNS.some(rx => rx.test(content));
}

function checkLinkDensity(content) {
  const links = extractLinks(content);
  const externalLinks = links.filter(url => {
    const domain = getDomain(url);
    return domain && !SPAM.ALLOWED_DOMAINS.has(domain);
  });
  return externalLinks.length > SPAM.MAX_LINKS;
}

function checkNewAccountWithLinks(message) {
  const accountAge = Date.now() - message.author.createdTimestamp;
  const hasLinks = extractLinks(message.content).some(url => {
    const domain = getDomain(url);
    return domain && !SPAM.ALLOWED_DOMAINS.has(domain);
  });
  return accountAge < SPAM.NEW_ACCOUNT_AGE_MS && hasLinks;
}

function checkDuplicates(message) {
  const key = message.author.id;
  const now = Date.now();
  const content = message.content.toLowerCase().trim();

  if (!recentMessages.has(key)) recentMessages.set(key, []);
  const history = recentMessages.get(key);

  // Prune old entries
  while (history.length && now - history[0].time > SPAM.DUPLICATE_WINDOW_MS) {
    history.shift();
  }

  history.push({ content, time: now });

  const dupeCount = history.filter(h => h.content === content).length;
  return dupeCount >= SPAM.DUPLICATE_THRESHOLD;
}

function checkRateLimit(message) {
  const key = message.author.id;
  const now = Date.now();

  if (!rateCounts.has(key)) rateCounts.set(key, []);
  const timestamps = rateCounts.get(key);

  // Prune old entries
  while (timestamps.length && now - timestamps[0] > SPAM.RATE_WINDOW_MS) {
    timestamps.shift();
  }

  timestamps.push(now);
  return timestamps.length > SPAM.RATE_THRESHOLD;
}

function isImmune(message) {
  if (BOT_CONFIG.IMMUNE_ROLES.size === 0) return false;
  return message.member?.roles.cache.some(role => BOT_CONFIG.IMMUNE_ROLES.has(role.id));
}

/**
 * @returns {'DELETE' | 'FLAG' | 'NONE'}
 */
function detectSpam(message) {
  if (isImmune(message)) return 'NONE';

  const content = message.content;

  if (checkPatterns(content)) return 'DELETE';
  if (checkLinkDensity(content)) return 'DELETE';
  if (checkNewAccountWithLinks(message)) return 'DELETE';
  if (checkDuplicates(message)) return 'DELETE';
  if (checkRateLimit(message)) return 'FLAG';

  return 'NONE';
}

// Periodic cleanup to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, history] of recentMessages) {
    const filtered = history.filter(h => now - h.time < SPAM.DUPLICATE_WINDOW_MS);
    if (filtered.length === 0) recentMessages.delete(key);
    else recentMessages.set(key, filtered);
  }
  for (const [key, timestamps] of rateCounts) {
    const filtered = timestamps.filter(t => now - t < SPAM.RATE_WINDOW_MS);
    if (filtered.length === 0) rateCounts.delete(key);
    else rateCounts.set(key, filtered);
  }
}, 60_000);

function addStrike(userId) {
  const count = (strikeMap.get(userId) || 0) + 1;
  strikeMap.set(userId, count);
  return count;
}

async function escalate(message) {
  const strikes = addStrike(message.author.id);
  const level = Math.min(strikes, ESCALATION.length) - 1;
  const action = ESCALATION[level];

  if (!action) return 'delete';

  if (action === 'ban') {
    try {
      await message.member.ban({ reason: `Auto-mod: ${strikes} spam strikes` });
      return 'ban';
    } catch (err) {
      console.error('[MOD] Ban failed:', err.message);
      return 'delete';
    }
  }

  try {
    await message.member.timeout(action, `Auto-mod: strike ${strikes}`);
    return `timeout_${action / 60000}m`;
  } catch (err) {
    console.error('[MOD] Timeout failed:', err.message);
    return 'delete';
  }
}

export { detectSpam, escalate };
