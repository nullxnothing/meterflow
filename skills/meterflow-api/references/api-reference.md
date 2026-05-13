# Meterflow API Reference

Base URL: `https://meterflow.fun/proxy`

All authenticated endpoints require:

```http
Authorization: Bearer mf_xxxxx
```

## Authentication

### Register Agent Wallet

```http
POST /auth/agent-register
Content-Type: application/json

{
  "wallet": "base58-solana-public-key",
  "signature": "base58-ed25519-signature",
  "message": "Meterflow Agent Registration\nWallet: <pubkey>\nTimestamp: <unix-ms>"
}
```

## Control Plane

```http
GET /v1/meters
GET /v1/receipts
GET /v1/receipts/export.csv
GET /v1/budgets
GET /v1/mcp-tools
```

```http
POST /v1/meters
POST /v1/budgets
POST /v1/mcp-tools
POST /v1/budgets/:id/revoke
```

## Paid Routes

```http
POST /mcp/token-risk
ANY  /gateway/{meterId}/*
```

## Error Codes

| Status | Error | Meaning |
|--------|-------|---------|
| 401 | `missing_api_key` | No Authorization header |
| 401 | `invalid_api_key` | Key not found |
| 401 | `signature_expired` | Registration signature too old |
| 403 | `policy_denied` | Agent budget does not allow this meter |
| 429 | `budget_exhausted` | Agent budget has reached its cap |
| 429 | `rate_limit_exceeded` | Daily call limit reached |
