/**
 * @typedef {Object} ClientConfig
 * @property {string} apiKey - Your INFINITE API key (inf_xxxxx)
 * @property {string} [baseUrl] - API base URL (defaults to production)
 * @property {number} [timeout] - Request timeout in ms (default: 30000)
 */

/**
 * @typedef {Object} ChatMessage
 * @property {'user'|'assistant'|'system'} role
 * @property {string} content
 */

/**
 * @typedef {Object} ChatRequest
 * @property {string} model - Model ID (e.g. 'claude-sonnet-4-6', 'gemini-2.5-flash')
 * @property {ChatMessage[]} messages
 * @property {number} [max_tokens]
 * @property {number} [temperature]
 * @property {string} [system]
 */

/**
 * @typedef {Object} ChatResponse
 * @property {string} id
 * @property {string} model
 * @property {Array<{type: string, text: string}>} content
 * @property {{input_tokens: number, output_tokens: number}} usage
 */

/**
 * @typedef {Object} MultiRequest
 * @property {string[]} models - Up to 4 model IDs
 * @property {ChatMessage[]} messages
 * @property {number} [max_tokens]
 * @property {number} [temperature]
 * @property {string} [system]
 */

/**
 * @typedef {Object} MultiResponse
 * @property {string} id
 * @property {'multi'} type
 * @property {Array<{model: string, content: Array, usage: Object, error?: string}>} responses
 */

/**
 * @typedef {Object} StreamEvent
 * @property {'content_delta'|'message_start'|'message_stop'|'error'|'done'} type
 * @property {string} [text]
 * @property {Object} [message]
 * @property {Object} [usage]
 * @property {string} [error]
 */

/**
 * @typedef {Object} MultiStreamEvent
 * @property {'model_start'|'model_result'|'model_error'|'done'} type
 * @property {string} [model]
 * @property {string} [text]
 * @property {Object} [content]
 * @property {Object} [usage]
 * @property {string} [error]
 */

/**
 * @typedef {Object} ImageRequest
 * @property {string} prompt
 * @property {string} [aspect_ratio]
 */

/**
 * @typedef {Object} TreasuryStatus
 * @property {number} multiplier
 * @property {string} healthStatus
 * @property {number} runwayDays
 * @property {number} dailyBudget
 * @property {number} treasuryBalanceSol
 * @property {number} treasuryBalanceUsd
 * @property {number} solPrice
 * @property {string} wallet
 * @property {number} totalKeysIssued
 * @property {Array} tiers
 */

export {};
