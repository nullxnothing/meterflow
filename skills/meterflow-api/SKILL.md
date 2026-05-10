---
name: meterflow-api
description: Use Meterflow API keys for metered agent-accessible routes, receipts, budgets, service routes, and x402-style payment workflows on Solana.
version: 1.0.0
metadata:
  openclaw:
    requires:
      env:
        - SOLANA_PRIVATE_KEY
      anyBins:
        - node
        - bun
    primaryEnv: SOLANA_PRIVATE_KEY
    emoji: "M"
    homepage: https://meterflow.fun
---

# Meterflow API

Meterflow is a control plane for x402-style paid API usage on Solana. Providers define metered routes. Operators connect wallets, issue client keys, set agent budgets, and inspect receipts.

## Core Concepts

- **Wallet:** operator identity and settlement context.
- **API key:** metered client credential for an agent or server.
- **Meter:** route, unit, price, asset, owner wallet, and status.
- **Receipt:** quote, payer wallet, payment proof, response state, and accounting record.
- **Budget:** daily cap, per-call cap, route allowlist, expiration, and revocation policy.

## URLs

- Dashboard: https://meterflow.fun/dashboard
- Docs: https://meterflow.fun/docs
- API base: https://meterflow.fun/proxy

## Register A Wallet

Use `scripts/register.js` to sign the Meterflow registration message and receive an API key.

```bash
SOLANA_PRIVATE_KEY=<base58_keypair> node scripts/register.js
```

Direct request shape:

```http
POST https://meterflow.fun/proxy/auth/agent-register
Content-Type: application/json

{
  "wallet": "<your-solana-public-key>",
  "signature": "<base58-signature-of-message>",
  "message": "Meterflow Agent Registration\nWallet: <public-key>\nTimestamp: <unix-ms>"
}
```

## Use A Metered Route

```bash
curl -X POST https://meterflow.fun/proxy/v1/chat \
  -H "Authorization: Bearer mf_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"Hello"}]}'
```

## Control Plane Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/v1/meters` | List billable routes |
| POST | `/v1/meters` | Create a meter |
| DELETE | `/v1/meters/:id` | Delete a custom meter |
| POST | `/v1/meters/:id/test` | Test a meter configuration |
| GET | `/v1/receipts` | List request receipts |
| GET | `/v1/receipts/:id` | Fetch one receipt |
| GET | `/v1/receipts/export.csv` | Export receipts |
| GET | `/v1/budgets` | List agent budgets |
| POST | `/v1/budgets` | Create a budget policy |
| POST | `/v1/budgets/:id/revoke` | Revoke a budget |
| GET | `/v1/mcp-tools` | List packaged MCP tools |
| POST | `/v1/mcp-tools` | Package an MCP tool |
| DELETE | `/v1/mcp-tools/:id` | Delete a packaged MCP tool |
| GET | `/v1/webhooks` | List webhook endpoints |
| POST | `/v1/webhooks` | Create a webhook endpoint |
| DELETE | `/v1/webhooks/:id` | Delete a webhook endpoint |
| POST | `/v1/webhooks/:id/test` | Send a test webhook event |

## Paid x402 Flow

Protected paid routes return an x402 quote when called without a payment header. A compatible x402 SVM client signs the quote, submits payment through the facilitator, and retries the request with the payment proof.

```bash
curl -X POST https://meterflow.fun/proxy/mcp/token-risk \
  -H "Content-Type: application/json" \
  -d '{"token":"So11111111111111111111111111111111111111112"}'
```

After settlement, Meterflow stores the receipt with the payer wallet, route, amount, payment state, and settlement transaction. Registered wallet users can list those paid receipts through `/v1/receipts` and inspect a single receipt through `/v1/receipts/:id`.

## SDK

```bash
npm install @meterflow/sdk
```

```js
import { MeterflowClient } from '@meterflow/sdk';

const client = new MeterflowClient({ apiKey: process.env.METERFLOW_API_KEY });

const res = await client.chat({
  model: 'claude-sonnet-4-6',
  messages: [{ role: 'user', content: 'Summarize this wallet' }],
});
```
