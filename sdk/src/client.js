import { parseSSEStream, parseMultiSSEStream } from './streaming.js';

const DEFAULT_BASE_URL = 'https://infinitekeys.fun/proxy';
const DEFAULT_TIMEOUT = 30_000;

export class InfiniteClient {
  /** @param {import('./types.js').ClientConfig} config */
  constructor(config) {
    if (!config?.apiKey) throw new Error('apiKey is required');
    this._apiKey = config.apiKey;
    this._baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    this._timeout = config.timeout || DEFAULT_TIMEOUT;
  }

  /**
   * Send a chat completion request.
   * @param {import('./types.js').ChatRequest} params
   * @returns {Promise<import('./types.js').ChatResponse>}
   */
  async chat(params) {
    return this._post('/v1/chat', params);
  }

  /**
   * Stream a chat completion. Returns an async iterable of SSE events.
   * @param {import('./types.js').ChatRequest} params
   * @returns {AsyncGenerator<import('./types.js').StreamEvent>}
   */
  async *chatStream(params) {
    const response = await this._fetch('/v1/chat/stream', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    yield* parseSSEStream(response);
  }

  /**
   * Send the same prompt to multiple models simultaneously.
   * @param {import('./types.js').MultiRequest} params
   * @returns {Promise<import('./types.js').MultiResponse>}
   */
  async multi(params) {
    return this._post('/v1/multi', params);
  }

  /**
   * Stream multi-model responses. Returns async iterable with per-model events.
   * @param {import('./types.js').MultiRequest} params
   * @returns {AsyncGenerator<import('./types.js').MultiStreamEvent>}
   */
  async *multiStream(params) {
    const response = await this._fetch('/v1/multi/stream', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    yield* parseMultiSSEStream(response);
  }

  /**
   * Generate an image.
   * @param {import('./types.js').ImageRequest} params
   * @returns {Promise<Object>}
   */
  async image(params) {
    return this._post('/v1/image', params);
  }

  /**
   * Get your auth status (tier, balance, usage, models).
   * @returns {Promise<Object>}
   */
  async status() {
    return this._get('/auth/status');
  }

  /**
   * Get live treasury data.
   * @returns {Promise<import('./types.js').TreasuryStatus>}
   */
  async treasury() {
    return this._get('/treasury');
  }

  /**
   * Get available providers.
   * @returns {Promise<{claude: boolean, gemini: boolean, openai: boolean}>}
   */
  async providers() {
    return this._get('/providers');
  }

  // ─── Internal ───

  async _post(path, body) {
    const response = await this._fetch(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return response.json();
  }

  async _get(path) {
    const response = await this._fetch(path, { method: 'GET' });
    return response.json();
  }

  async _fetch(path, opts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeout);

    try {
      const response = await fetch(`${this._baseUrl}${path}`, {
        ...opts,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this._apiKey}`,
          ...opts.headers,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { message: text }; }
        const err = new Error(data.message || data.error || `HTTP ${response.status}`);
        err.status = response.status;
        err.data = data;
        throw err;
      }

      return response;
    } finally {
      clearTimeout(timer);
    }
  }
}
