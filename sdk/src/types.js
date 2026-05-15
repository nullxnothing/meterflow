/**
 * @typedef {Object} ClientConfig
 * @property {string} apiKey - Your Meterflow API key (mf_xxxxx)
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

/**
 * @typedef {Object} MeterRequest
 * @property {string} [route]
 * @property {'GET'|'POST'|'PUT'|'DELETE'} [method]
 * @property {string} [unit]
 * @property {number} priceUsd
 * @property {string} [asset]
 * @property {'test'|'live'|'paused'} [status]
 * @property {string} [ownerWallet]
 * @property {string} [targetUrl]
 * @property {string} [providerName]
 * @property {{type?: 'bearer'|'header', headerName?: string, value: string}} [upstreamAuth]
 */

/**
 * @typedef {Object} HostedMeterRequest
 * @property {string} targetUrl - External API origin or base URL to proxy.
 * @property {'GET'|'POST'|'PUT'|'DELETE'} [method]
 * @property {number} priceUsd
 * @property {string} [unit]
 * @property {'test'|'live'|'paused'} [status]
 * @property {string} [providerName]
 * @property {{type?: 'bearer'|'header', headerName?: string, value: string}} [upstreamAuth]
 */

/**
 * @typedef {Object} BudgetRequest
 * @property {string} [name]
 * @property {string} [agentId]
 * @property {number} [dailyCapUsd]
 * @property {number} [perCallCapUsd]
 * @property {string[]} [allowedMeterIds]
 * @property {string[]} [allowedRoutes]
 * @property {Array<'x402'|'mpp'|'meterflow'|'api-key'|'solana-pay'>} [allowedRails]
 * @property {string[]} [deniedProviderIds]
 * @property {'enforce'|'monitor'} [mode]
 * @property {boolean} [piiGuard]
 * @property {boolean} [requireReceipt]
 * @property {number} [approvalThresholdUsd]
 */

/**
 * @typedef {Object} PolicyEvaluationRequest
 * @property {string} [meterId]
 * @property {string} [route]
 * @property {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} [method]
 * @property {string} [agentId]
 * @property {number} [amountUsd]
 * @property {'x402'|'mpp'|'meterflow'|'api-key'|'solana-pay'} [paymentProtocol]
 * @property {'request'|'session'|'stream'} [intent]
 * @property {number} [expectedCalls]
 * @property {string} [providerId]
 * @property {string} [payerWallet]
 * @property {boolean} [requiresCompliance]
 * @property {boolean} [gasless]
 * @property {Object} [metadata]
 * @property {boolean} [record]
 */

/**
 * @typedef {Object} ResourcePackPolicyRequest
 * @property {string} [presetId]
 * @property {string} [name]
 * @property {string} [agentId]
 * @property {string[]} [resourceIds]
 * @property {number} [dailyCapUsd]
 * @property {number} [perCallCapUsd]
 * @property {Array<'x402'|'mpp'|'meterflow'|'api-key'|'solana-pay'>} [allowedRails]
 * @property {'enforce'|'monitor'} [mode]
 * @property {boolean} [piiGuard]
 * @property {boolean} [requireReceipt]
 * @property {number} [approvalThresholdUsd]
 */

/**
 * @typedef {Object} McpToolRequest
 * @property {string} name
 * @property {string} [manifestUrl]
 * @property {string} [route]
 * @property {number} [priceUsd]
 * @property {'test'|'live'|'paused'} [status]
 */

/**
 * @typedef {Object} RegistryProvider
 * @property {string} id
 * @property {string} slug
 * @property {string} name
 * @property {string} category
 * @property {string} summary
 * @property {string} endpoint
 * @property {string[]} protocolRails
 * @property {string} paymentAsset
 * @property {number} priceUsd
 * @property {'forming'|'test'|'live'|'paused'|'archived'} status
 * @property {'unverified'|'reviewing'|'verified'|'prime'} verification
 * @property {{asset: string, required: number, committed: number, state: string, txSignature?: string, unlockCooldownDays: number}} bond
 * @property {{successfulCalls: number, verifiedUsd: number, uptimePct: number|null, p95LatencyMs: number|null, failureRatePct: number|null, receipts30d: number}} metrics
 * @property {{supportsBudgets: boolean, supportsRefunds: boolean, piiGuard: boolean, agentAllowlisted: boolean}} policy
 * @property {number} trustScore
 * @property {'emerging'|'candidate'|'verified'|'prime'} trustTier
 */

export {};
