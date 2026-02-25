const RETRYABLE_CODES = new Set([429, 500, 502, 503, 504, 529]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 800;

/**
 * Calculate backoff delay, respecting retry-after header when present.
 */
function getRetryDelay(attempt, response) {
  const retryAfter = response?.headers?.get?.('retry-after');
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds) && seconds > 0 && seconds < 60) {
      return seconds * 1000;
    }
  }
  // 529 (overloaded) gets extra backoff
  const multiplier = response?.status === 529 ? 1.5 : 1;
  return BASE_DELAY_MS * Math.pow(2, attempt) * multiplier;
}

/**
 * Wraps a fetch-based provider call with retry + exponential backoff.
 * Retries on transient HTTP errors (429, 5xx, 529).
 * @param {() => Promise<Response>} fetchFn - Returns a fetch Response
 * @param {string} provider - Provider name for error messages
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(fetchFn, provider) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchFn();

      if (response.ok || !RETRYABLE_CODES.has(response.status)) {
        return response;
      }

      const errBody = await response.text();
      lastError = new Error(`${provider} ${response.status}: ${errBody}`);

      if (attempt < MAX_RETRIES) {
        const delay = getRetryDelay(attempt, response);
        await new Promise(r => setTimeout(r, delay));
      }
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError' || err.name === 'TimeoutError') throw err;

      if (attempt < MAX_RETRIES) {
        const delay = getRetryDelay(attempt, null);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

const STREAM_MAX_RETRIES = 2;
const STREAM_BASE_DELAY = 1000;

/**
 * Fetch with retry for streaming requests.
 * @param {string} url
 * @param {RequestInit} options
 * @param {string} label - Provider name for error messages
 * @returns {Promise<Response>}
 */
export async function fetchStreamWithRetry(url, options, label) {
  let lastError;
  for (let attempt = 0; attempt <= STREAM_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || !RETRYABLE_CODES.has(response.status)) return response;

      const errBody = await response.text();
      lastError = new Error(`${label} ${response.status}: ${errBody}`);

      if (attempt < STREAM_MAX_RETRIES) {
        const delay = getRetryDelay(attempt, response) || STREAM_BASE_DELAY * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
      }
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError' || err.name === 'TimeoutError') throw err;
      if (attempt < STREAM_MAX_RETRIES) {
        await new Promise(r => setTimeout(r, STREAM_BASE_DELAY * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}
