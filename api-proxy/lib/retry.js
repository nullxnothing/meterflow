const RETRYABLE_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 500;

/**
 * Wraps a fetch-based provider call with retry + exponential backoff.
 * Only retries on transient HTTP errors (429, 5xx).
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
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
      }
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError' || err.name === 'TimeoutError') throw err;

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}
