import { parseSSEStream, parseMultiSSEStream } from './streaming.js';

const DEFAULT_BASE_URL = 'https://meterflow.fun/proxy';
const DEFAULT_TIMEOUT = 30_000;

export class MeterflowClient {
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

  /**
   * List configured meters.
   * @returns {Promise<{meters: Array}>}
   */
  async meters() {
    return this._get('/v1/meters');
  }

  /**
   * Create a metered route, API, or MCP product.
   * @param {import('./types.js').MeterRequest} params
   */
  async createMeter(params) {
    return this._post('/v1/meters', params);
  }

  /**
   * Create a hosted gateway meter for an external provider API.
   * @param {import('./types.js').HostedMeterRequest} params
   */
  async createHostedMeter(params) {
    return this.createMeter(params);
  }

  /**
   * Preview route matching, quote economics, and hosted gateway status.
   * @param {string} meterId
   */
  async testMeter(meterId) {
    return this._post(`/v1/meters/${encodeURIComponent(meterId)}/test`, {});
  }

  /**
   * Delete a custom meter you own.
   * @param {string} meterId
   */
  async deleteMeter(meterId) {
    const response = await this._fetch(`/v1/meters/${encodeURIComponent(meterId)}`, {
      method: 'DELETE',
    });
    return response.json();
  }

  /**
   * List request receipts for this client key.
   * @param {{meterId?: string, status?: string, limit?: number}} [params]
   */
  async receipts(params = {}) {
    return this._get(`/v1/receipts${this._query(params)}`);
  }

  /**
   * List agent budget policies for this client key.
   */
  async budgets() {
    return this._get('/v1/budgets');
  }

  /**
   * Create an agent budget policy.
   * @param {import('./types.js').BudgetRequest} params
   */
  async createBudget(params) {
    return this._post('/v1/budgets', params);
  }

  /**
   * Revoke an agent budget policy.
   * @param {string} budgetId
   */
  async revokeBudget(budgetId) {
    return this._post(`/v1/budgets/${encodeURIComponent(budgetId)}/revoke`, {});
  }

  /**
   * Inspect the active agent spend-control capabilities for this key.
   */
  async policyCapabilities() {
    return this._get('/v1/policy/capabilities');
  }

  /**
   * Evaluate a planned x402/MPP/API-key call before the agent spends.
   * @param {import('./types.js').PolicyEvaluationRequest} params
   */
  async evaluatePolicy(params) {
    return this._post('/v1/policy/evaluate', params);
  }

  /**
   * Package an MCP tool behind a Meterflow gateway.
   * @param {import('./types.js').McpToolRequest} params
   */
  async createMcpTool(params) {
    return this._post('/v1/mcp-tools', params);
  }

  /**
   * Delete an MCP tool package you own.
   * @param {string} toolId
   */
  async deleteMcpTool(toolId) {
    const response = await this._fetch(`/v1/mcp-tools/${encodeURIComponent(toolId)}`, {
      method: 'DELETE',
    });
    return response.json();
  }

  /**
   * Get provider revenue aggregates by meter.
   */
  async providerRevenue() {
    return this._get('/v1/providers/revenue');
  }

  /**
   * Get the public Meterflow provider trust registry summary.
   */
  async registrySummary() {
    return this._get('/v1/registry/summary');
  }

  /**
   * List public registry providers by trust score.
   * @param {{category?: string, rail?: string, status?: string, verification?: string, minScore?: number, limit?: number}} [params]
   */
  async registryProviders(params = {}) {
    return this._get(`/v1/registry/providers${this._query(params)}`);
  }

  /**
   * Read one public registry provider by id or slug.
   * @param {string} providerIdOrSlug
   */
  async registryProvider(providerIdOrSlug) {
    return this._get(`/v1/registry/providers/${encodeURIComponent(providerIdOrSlug)}`);
  }

  /**
   * List public resource packs such as the Xona agent resource catalog.
   */
  async resourcePacks() {
    return this._get('/v1/resource-packs');
  }

  /**
   * Read a resource pack by id or slug.
   * @param {string} packIdOrSlug
   */
  async resourcePack(packIdOrSlug) {
    return this._get(`/v1/resource-packs/${encodeURIComponent(packIdOrSlug)}`);
  }

  /**
   * Build a policy template for a resource pack without persisting it.
   * @param {string} packIdOrSlug
   * @param {import('./types.js').ResourcePackPolicyRequest} params
   */
  async resourcePackPolicyTemplate(packIdOrSlug, params = {}) {
    return this._post(`/v1/resource-packs/${encodeURIComponent(packIdOrSlug)}/policy-template`, params);
  }

  /**
   * Create a spend-control budget from a resource pack preset.
   * @param {string} packIdOrSlug
   * @param {import('./types.js').ResourcePackPolicyRequest} params
   */
  async createResourcePackBudget(packIdOrSlug, params = {}) {
    return this._post(`/v1/resource-packs/${encodeURIComponent(packIdOrSlug)}/budgets`, params);
  }

  /**
   * List configured webhook endpoints.
   */
  async webhooks() {
    return this._get('/v1/webhooks');
  }

  /**
   * Create a signed webhook endpoint.
   * @param {{url: string, events?: string[], secret?: string}} params
   */
  async createWebhook(params) {
    return this._post('/v1/webhooks', params);
  }

  /**
   * Send a test event to a webhook endpoint.
   * @param {string} webhookId
   */
  async testWebhook(webhookId) {
    return this._post(`/v1/webhooks/${encodeURIComponent(webhookId)}/test`, {});
  }

  /**
   * Delete a webhook endpoint.
   * @param {string} webhookId
   */
  async deleteWebhook(webhookId) {
    const response = await this._fetch(`/v1/webhooks/${encodeURIComponent(webhookId)}`, {
      method: 'DELETE',
    });
    return response.json();
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

  _query(params) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
    }
    const text = qs.toString();
    return text ? `?${text}` : '';
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

// Backward-compatible alias for existing integrations.
