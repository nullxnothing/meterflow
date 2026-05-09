# Meterflow

Control plane for x402-style API payments on Solana.

[Website](https://meterflow.fun) · [Dashboard](https://meterflow.fun/dashboard) · [Docs](https://meterflow.fun/docs) · [GitHub](https://github.com/nullxnothing/meterflow) · [X](https://x.com/meterflowsol) · [Discord](https://discord.gg/tned74z4eN)

## What It Is

Meterflow helps API providers, MCP tool builders, data vendors, and agent operators turn paid requests into observable products.

Solana moves the money. Meterflow tracks what was sold, who paid, which agent called it, whether policy allowed it, how much was owed, and where the receipt lives.

## Why It Exists

Agents need paid tools they can call without monthly SaaS accounts, shared credit cards, or unlimited wallet access. API providers need per-request pricing, receipts, budgets, and customer visibility after a payment clears.

Meterflow is the layer around that request:

1. Create a meter for an API route, MCP tool, model call, data feed, or workflow.
2. Connect a Solana wallet for identity, settlement, and admin control.
3. Issue metered client keys or wallet-bound agent budgets.
4. Let agents call paid routes through the gateway.
5. Review receipts, failed payments, spend caps, and provider revenue in the dashboard.

## Product Surfaces

| Surface | What it does |
| --- | --- |
| Meters | Define billable routes, units, prices, assets, providers, and route state |
| Receipts | Track quote, payer, proof, amount, route, policy result, and response status |
| Agent Budgets | Set per-call caps, daily caps, route allowlists, expirations, and revocation |
| MCP Tools | Package tool calls as priced capabilities agents can reason about |
| API Keys | Issue metered clients for apps, agents, and provider integrations |
| Settlement Wallet | Inspect wallet context for provider funding and gateway operations |
| Integrations | Attach Solana, data, model, social, and notification providers |

## Gateway Routes

The current gateway includes live service routes that can be metered and shown in the dashboard:

- `POST /v1/chat`
- `POST /v1/chat/stream`
- `POST /v1/multi`
- `POST /v1/multi/stream`
- `POST /v1/image`
- `POST /v1/video/generate`
- `GET /v1/alpha/*`
- `POST /mcp/token-risk`

These are the first services running through Meterflow. The product is the metering, receipt, budget, and settlement layer around any paid endpoint.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `site/` | Public website and docs |
| `dashboard/` | Wallet-connected control plane |
| `api-proxy/` | Express gateway, auth, meters, receipts, budgets, x402, and service routes |
| `sdk/` | JavaScript client for Meterflow routes |
| `skills/meterflow-api/` | Agent skill and provider metadata |

## SDK Quick Start

```js
import { MeterflowClient } from '@meterflow/sdk';

const client = new MeterflowClient({
  apiKey: 'mf_xxxxx',
});

const response = await client.chat({
  model: 'claude-sonnet-4-6',
  messages: [{ role: 'user', content: 'Explain agent budgets on Solana' }],
});

console.log(response.content);
```

## Local Development

```bash
cd api-proxy
cp .env.example .env
npm install
npm run migrate
npm test
npm run dev
```

Serve the static site and dashboard from the repository root with any local static server. Vercel rewrites `/proxy/*` to the API service on Render.

## Environment

Core API variables:

- `HELIUS_API_KEY`
- `HELIUS_RPC_URL`
- `METERFLOW_TOKEN_MINT`
- `SETTLEMENT_WALLET`
- `API_KEY_SECRET`
- `WALLET_ENCRYPTION_SECRET`
- `DATABASE_URL`
- `REDIS_URL`
- `ERROR_ALERT_WEBHOOK` optional, for production error notifications

Persistence:

- Postgres stores the Meterflow control plane: meters, receipts, agent budgets, MCP tools, webhooks, and idempotency records.
- Redis stores rate limits, API keys, usage counters, and session/cache data.
- Run `npm run migrate` from `api-proxy/` after setting `DATABASE_URL`.

x402 variables:

- `X402_FACILITATOR_PRIVATE_KEY`
- `X402_PAY_TO`
- `SETTLEMENT_WALLET_PRIVATE_KEY`

## Deployment

Frontend is deployed on Vercel at [meterflow.fun](https://meterflow.fun). The API service is configured through `render.yaml` and the Vercel `/proxy/*` rewrite.

Because the API currently runs on Render, database and Redis credentials must be configured on the Render service. If a Vercel-managed Postgres or Redis resource is used, copy its connection variables into Render or move the API runtime to Vercel before relying on those Vercel project env vars.

## License

MIT
