import { URL } from 'url';

const BLOCKED_HOSTS = [
  'localhost', '127.0.0.1', '0.0.0.0', '[::1]',
  'metadata.google.internal', '169.254.169.254',
  'metadata.internal',
];

const BLOCKED_RANGES = [
  /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^fd[0-9a-f]{2}:/i,
];

function isBlockedUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTS.includes(host)) return true;
    if (BLOCKED_RANGES.some(r => r.test(host))) return true;
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;
    return false;
  } catch {
    return true;
  }
}

function stripHtml(html) {
  // Remove scripts, styles, and their content
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
  // Replace block elements with newlines
  text = text.replace(/<(br|p|div|h[1-6]|li|tr)[^>]*>/gi, '\n');
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode common entities
  text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim().replace(/\s+/g, ' ') : null;
}

const MAX_CONTENT_LENGTH = 8000;
const FETCH_TIMEOUT_MS = 10000;

export async function executeUrlReader({ url }) {
  if (!url || typeof url !== 'string') {
    return { error: 'url is required' };
  }

  if (isBlockedUrl(url)) {
    return { error: 'URL is blocked for security reasons (private/internal addresses not allowed)' };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; InfiniteBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,text/plain,application/json',
      },
      redirect: 'follow',
    });

    clearTimeout(timer);

    if (!response.ok) {
      return { error: `HTTP ${response.status}: ${response.statusText}`, url };
    }

    const contentType = response.headers.get('content-type') || '';
    const raw = await response.text();

    let title = null;
    let content;

    if (contentType.includes('application/json')) {
      content = raw.slice(0, MAX_CONTENT_LENGTH);
    } else if (contentType.includes('text/html') || contentType.includes('xhtml')) {
      title = extractTitle(raw);
      content = stripHtml(raw).slice(0, MAX_CONTENT_LENGTH);
    } else {
      content = raw.slice(0, MAX_CONTENT_LENGTH);
    }

    return {
      url,
      title,
      content,
      contentLength: raw.length,
      truncated: raw.length > MAX_CONTENT_LENGTH,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { error: 'Request timed out (10s limit)', url };
    }
    return { error: err.message, url };
  }
}
