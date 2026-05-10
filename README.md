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

Serve the static site and dashboard from the repository root with any local static server. In production, Vercel rewrites `/proxy/*` to the local Vercel Function at `/api/*`.

## Environment

Core API variables:

- `HELIUS_API_KEY`
- `HELIUS_RPC_URL`
- `API_KEY_SECRET`
- `WALLET_ENCRYPTION_SECRET`
- `DATABASE_URL`
- `REDIS_URL`
- `ERROR_ALERT_WEBHOOK` optional, for production error notifications
- `SENTRY_DSN` optional, for stack traces and grouped production errors

Token and settlement variables:

- `METERFLOW_TOKEN_MINT` optional, enables token-gated utility tiers when set
- `X402_PAY_TO`, `SETTLEMENT_WALLET`, or `TREASURY_WALLET` for the provider or treasury USDC recipient

Persistence:

- Postgres stores the Meterflow control plane: meters, receipts, agent budgets, MCP tools, webhooks, and idempotency records.
- Redis stores rate limits, API keys, usage counters, and session/cache data.
- Run `npm run migrate` from `api-proxy/` after setting `DATABASE_URL`.

x402 variables:

- `X402_PAY_TO` or `SETTLEMENT_WALLET`
- PayAI hosted facilitator is used by default
- `PAYAI_API_KEY_ID` and `PAYAI_API_KEY_SECRET` optional, for paid PayAI merchant capacity beyond the free tier
- `X402_FACILITATOR_PRIVATE_KEY` or `SETTLEMENT_WALLET_PRIVATE_KEY` optional, only if running an inline facilitator instead of PayAI

## Deployment

Frontend and API are deployed on Vercel at [meterflow.fun](https://meterflow.fun). The API is exposed through `/proxy/*`, which rewrites to a Vercel Function wrapper around the Express app in `api-proxy/app.js`.

For production, attach Postgres and Redis resources to the Vercel project, set the API env vars in Vercel, redeploy, then run the migration against the production `DATABASE_URL`.

GitHub Actions runs `npm test` on pushes and pull requests. The `Production Smoke` workflow also checks the live site and API every 30 minutes. Add a GitHub Actions secret named `METERFLOW_DISCORD_WEBHOOK` if you want failed production smoke runs to post into the private Meterflow alerts channel.

## Production Verification

Use the smoke scripts before and after deploys:

```bash
npm test
npm run smoke:prod
npm run smoke:paid
```

`npm run smoke:prod` checks the public site, dashboard assets, docs routes, API health, provider readiness, x402 CORS, and unpaid x402 quote generation.

`npm run smoke:paid` performs a real x402 SVM payment against the production paid route, currently `POST /proxy/mcp/token-risk` at `0.006` USDC. It verifies the 402 quote, signs the payment, submits through the PayAI facilitator, requires an on-chain settlement transaction signature, and checks that the resulting receipt is visible to the paying wallet.

The paid smoke uses the local Solana CLI keypair at `~/.config/solana/id.json` by default. You can override it with `METERFLOW_PAYER_PRIVATE_KEY`, `X402_PAYER_PRIVATE_KEY`, or `SVM_PRIVATE_KEY` using a base58 secret key or JSON-array keypair. Optional overrides include `METERFLOW_SMOKE_BASE_URL`, `METERFLOW_PAID_ROUTE`, `METERFLOW_PAID_TOKEN`, `SOLANA_RPC_URL`, and `HELIUS_RPC_URL`.

## License

MIT
