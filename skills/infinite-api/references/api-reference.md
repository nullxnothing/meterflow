# INFINITE Protocol API Reference

Base URL: `https://infinitekeys.fun/proxy`

All authenticated endpoints require: `Authorization: Bearer inf_xxxxx`

## Authentication

### Register (Agent)
```
POST /auth/agent-register
Content-Type: application/json

{
  "wallet": "base58-solana-public-key",
  "signature": "base58-ed25519-signature",
  "message": "INFINITE Protocol Agent Registration\nWallet: <pubkey>\nTimestamp: <unix-ms>"
}

Response 200:
{
  "apiKey": "inf_xxxxx",
  "tier": "Signal",
  "balance": 50000,
  "dailyLimit": 1000,
  "models": ["claude-sonnet-4-6", "gemini-2.5-flash", "gpt-4o-mini"],
  "isTrial": false,
  "tokenMint": "infjrafE4zVaCMLxRTNg9anSZoyGWaKDQPHXmzYLPUf",
  "dashboard": "https://infinitekeys.fun"
}
```

### Check Status
```
GET /auth/status
Authorization: Bearer inf_xxxxx

Response 200:
{
  "wallet": "...",
  "tier": "Signal",
  "balance": 50000,
  "usage": { "today": 42, "limit": 1000, "remaining": 958 },
  "models": ["claude-sonnet-4-6", "gemini-2.5-flash", "gpt-4o-mini"]
}
```

### Discover Tiers (Public)
```
GET /auth/tiers

Response 200:
{
  "tokenMint": "infjrafE4zVaCMLxRTNg9anSZoyGWaKDQPHXmzYLPUf",
  "tokenSymbol": "INF",
  "chain": "solana",
  "dashboard": "https://infinitekeys.fun",
  "tiers": [
    { "id": "trial", "label": "Trial", "minTokens": 0, "dailyLimit": 3, "models": ["gpt-4o-mini"] },
    { "id": "signal", "label": "Signal", "minTokens": 10000, ... },
    { "id": "operator", "label": "Operator", "minTokens": 100000, ... },
    { "id": "architect", "label": "Architect", "minTokens": 1000000, ... },
    { "id": "alpha", "label": "Alpha", "minTokens": 10000000, ... }
  ]
}
```

### Rotate Key
```
POST /auth/rotate
Authorization: Bearer inf_xxxxx

Response 200:
{ "apiKey": "inf_new_xxxxx", "tier": "Signal", "message": "New key issued." }
```

### Revoke Key
```
POST /auth/revoke
Authorization: Bearer inf_xxxxx

Response 200:
{ "message": "API key revoked." }
```

## AI Endpoints

### Chat Completion
```
POST /v1/chat
Authorization: Bearer inf_xxxxx
Content-Type: application/json

{
  "model": "claude-sonnet-4-6",
  "messages": [
    { "role": "system", "content": "You are helpful." },
    { "role": "user", "content": "Hello!" }
  ],
  "max_tokens": 1024,
  "temperature": 0.7
}
```

### Streaming Chat
```
POST /v1/chat/stream
Authorization: Bearer inf_xxxxx
Content-Type: application/json

(same body as /v1/chat)

Response: Server-Sent Events stream
```

### Multi-Model Inference
```
POST /v1/multi
Authorization: Bearer inf_xxxxx
Content-Type: application/json

{
  "models": ["claude-sonnet-4-6", "gemini-2.5-flash"],
  "messages": [{ "role": "user", "content": "What is Solana?" }]
}

Response 200:
{
  "responses": [
    { "model": "claude-sonnet-4-6", "content": [{ "text": "..." }] },
    { "model": "gemini-2.5-flash", "content": [{ "text": "..." }] }
  ]
}
```

### Image Generation
```
POST /v1/image
Authorization: Bearer inf_xxxxx
Content-Type: application/json

{ "prompt": "A neon Solana logo", "size": "1024x1024" }
```

## Error Codes

| Status | Error | Meaning |
|--------|-------|---------|
| 401 | `missing_api_key` | No Authorization header |
| 401 | `invalid_api_key` | Key not found |
| 401 | `signature_expired` | Registration signature too old |
| 403 | `tier_restricted` | Feature requires higher tier |
| 429 | `rate_limit_exceeded` | Daily limit reached |
| 429 | `trial_exhausted` | Trial calls used up |

## Token Details

- **Token:** $INF (INFINITE)
- **Mint:** `infjrafE4zVaCMLxRTNg9anSZoyGWaKDQPHXmzYLPUf`
- **Chain:** Solana
- **Buy via:** Jupiter Aggregator, Raydium, or PumpPortal
