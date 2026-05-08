# Meterflow

**Control plane for x402-style API payments on Solana.**

Meterflow helps API providers, MCP tool builders, data vendors, and agent operators turn paid requests into something observable and controllable. Wallets anchor identity and settlement. Metered client keys let agents call protected routes. The dashboard shows quotes, payments, receipts, failures, revenue, and budget limits.

[Website](https://meterflow.fun) | [Dashboard](https://meterflow.fun/dashboard) | [Docs](https://meterflow.fun/docs) | [X](https://x.com/meterflowsol) | [Discord](https://discord.gg/tned74z4eN)

## What Meterflow Does

Meterflow is not just a payment button. It is the operating layer around paid API usage:

1. Providers register a metered route, MCP tool, model call, data feed, or workflow.
2. Operators connect a Solana wallet and issue agent-scoped client keys.
3. Agents request paid capabilities through those keys and budget policies.
4. Meterflow records quote, payer wallet, payment proof, response state, and receipt data.
5. Builders inspect revenue, failures, customer usage, and exportable accounting records.

## Core Product

| Surface | Purpose |
|---------|---------|
| Meters | Define billable routes, units, prices, accepted assets, provider wallets, and policy |
| Receipts | Track paid requests, failed payments, response status, payer wallet, and exports |
| Agent Budgets | Set per-call caps, daily caps, route allowlists, expiration, and revocation |
| Service Routes | Manage the APIs, model calls, data feeds, and MCP tools running through Meterflow |
| API Keys | Issue metered clients for agents, apps, and provider integrations |
| Settlement Wallet | Inspect wallet context for provider funding and settlement operations |
| Integrations | Catalog supported provider, data, wallet, and notification integrations |

## Repository Layout

| Directory | Description |
|-----------|-------------|
| `api-proxy/` | Express API gateway for wallet auth, metered service routes, usage accounting, agents, and Solana tools |
| `dashboard/` | Meterflow control plane for meters, receipts, budgets, keys, service routes, settlement, and integrations |
| `site/` | Public product site and documentation |
| `sdk/` | JavaScript SDK for Meterflow gateway calls and streaming routes |
| `extension/` | Browser extension for social intelligence routes that can be metered through Meterflow |
| `agent/`, `eliza-agent/` | Agent runtime experiments and automation surfaces |
| `discord-bot/`, `twitter-bot/` | Notification and community automation surfaces |
| `skills/` | Agent skill definitions |

## Current Gateway Routes

The existing gateway exposes service routes that can be metered and shown in the dashboard:

- `/v1/chat` and `/v1/chat/stream`
- `/v1/multi` and `/v1/multi/stream`
- `/v1/image`
- `/v1/video/*`
- `/v1/agents/*`
- `/v1/twitter/*`
- `/v1/alpha/*`
- `/v1/trading/*`

These routes are product examples and integrations, not the whole product. Meterflow’s main value is the control plane around usage, receipts, budgets, and settlement.

## SDK Quick Start

```js
import { MeterflowClient } from '@meterflow/sdk';

const client = new MeterflowClient({ apiKey: 'mf_xxxxx' });

const response = await client.chat({
  model: 'claude-sonnet-4-6',
  messages: [{ role: 'user', content: 'Summarize this Solana transaction' }],
});

for await (const event of client.chatStream({
  model: 'gemini-2.5-flash',
  messages: [{ role: 'user', content: 'Explain agent budgets' }],
})) {
  if (event.type === 'content_delta') process.stdout.write(event.text);
}
```

## Local Development

```bash
cd api-proxy
cp .env.example .env
npm install
npm run dev
```

The static site and dashboard can be served from the repository root with any local static server. The Vercel deployment rewrites `/proxy/*` to the API service.

## Environment

Use `METERFLOW_TOKEN_MINT` for token compatibility if needed. New code, docs, and product surfaces should use Meterflow naming.

## Built With

Solana, USDC, x402-style payment flows, Helius, Jupiter, Node.js, Express, Redis, browser-native JavaScript, and provider routes for model, data, media, social, and trading services.

## License

MIT
