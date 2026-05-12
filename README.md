<p align="center">
  <img src="assets/brand/og-meterflow.png" alt="Meterflow" width="100%">
</p>

# Meterflow

Solana-native payment, metering, receipt, and budget infrastructure for third-party APIs and MCP tools.

[Website](https://meterflow.fun) · [Dashboard](https://meterflow.fun/dashboard) · [Docs](https://meterflow.fun/docs) · [GitHub](https://github.com/nullxnothing/meterflow) · [X](https://x.com/meterflowsol) · [Discord](https://discord.gg/tned74z4eN)

## $MFLOW

Official contract address: `GrFTVNJi6JKbLRFTXSXYki72ovYWVmbvDcrHHS2mpump`

The site and backend use `METERFLOW_TOKEN_CA` as the master token address. Set that env var once when the token is public and Meterflow will use it for the token page, holder checks, and token-gated utility tiers.

## What It Is

Meterflow helps API providers, MCP tool builders, data vendors, and agent operators turn paid requests into observable products. It is a Stripe-like control plane for per-request Solana USDC settlement using x402-style HTTP 402 payments.

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

## Hosted Provider Gateway

Providers can wrap an external API without moving it into the Meterflow app:

```js
const { meter } = await client.createHostedMeter({
  targetUrl: 'https://api.example.com',
  method: 'GET',
  unit: 'lookup',
  priceUsd: 0.01,
  providerName: 'Example Data API',
  status: 'test',
});

console.log(meter.route); // /gateway/mtr_xxxxx/*
```

Meterflow stores the target origin on the meter, generates a hosted route, issues x402 payment requirements for callers, proxies successful requests upstream, and records receipts with upstream status and latency. Upstream auth secrets are stored server-side and never returned in meter API responses.

## Wrap Your API In 10 Minutes

1. Connect a wallet and create a Meterflow API key.
2. Create a hosted meter with `targetUrl`, `method`, `priceUsd`, `unit`, and optional `providerName`.
3. Test the meter with `POST /v1/meters/:id/test`.
4. Send callers to `https://meterflow.fun/proxy/gateway/{meterId}/...`.
5. Watch receipts, provider revenue, webhook deliveries, and budget decisions in the dashboard.

## Monetize An MCP Tool

Register an MCP tool with `POST /v1/mcp-tools` or create a hosted meter for your MCP HTTP endpoint. Meterflow handles payment quotes, Solana USDC settlement context, receipts, webhooks, and agent budget enforcement. The built-in `/mcp/token-risk` route is a demo of this pattern.

## Agent Budgets And Spend Caps

Agent operators can create budgets with daily caps, per-call caps, and meter allowlists. Budgets let agents call paid APIs without receiving unlimited wallet authority or open-ended API spend.

## Receipts, Settlement, Revenue, And Webhooks

Every metered call can produce a receipt with meter id, route, payer, amount, policy result, upstream status, latency, and settlement metadata. Providers can query `/v1/providers/revenue` and subscribe to signed webhooks such as `receipt.created`, `receipt.verified`, and `payment.failed`.

## Demo Routes

The current gateway includes AI, token-risk, and trading routes that demonstrate Meterflow running real paid capabilities:

- `POST /v1/chat`
- `POST /v1/chat/stream`
- `POST /v1/multi`
- `POST /v1/multi/stream`
- `POST /v1/image`
- `POST /v1/video/generate`
- `GET /v1/alpha/*`
- `POST /mcp/token-risk`

These routes are examples. The product is the metering, receipt, budget, webhook, provider revenue, and settlement layer around any paid endpoint.

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
  apiKey: 'mf_live_xxxxx_secret',
});

const { meter } = await client.createHostedMeter({
  targetUrl: 'https://api.example.com',
  method: 'GET',
  unit: 'lookup',
  priceUsd: 0.01,
});

console.log(meter.route);
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

- `METERFLOW_TOKEN_CA` is the canonical `$MFLOW` contract address used by the whole site, token page, and token-gated utility tiers. Current public CA: `GrFTVNJi6JKbLRFTXSXYki72ovYWVmbvDcrHHS2mpump`
- `METERFLOW_TOKEN_MINT` is still supported as a backward-compatible fallback
- `METERFLOW_TOKEN_NAME`, `METERFLOW_TOKEN_SYMBOL`, and `METERFLOW_TOKEN_SWAP_URL` control token page labeling and trade links
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
