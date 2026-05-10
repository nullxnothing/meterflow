# Meterflow v2 Builder Guide

Meterflow v2 moves the product toward one core promise:

> Turn any API, MCP tool, data feed, model call, or workflow into a paid USDC endpoint with agent-safe budgets and receipts.

This guide documents the first v2 implementation slice on the `v2` branch.

## What v2 Adds First

- Express paywall middleware for declaring paid API routes in builder apps.
- CLI workflows for meters, receipts, budget templates, budget simulation, and MCP publishing.
- Prebuilt agent budget templates for research agents, token-risk agents, trading bots, hackathon demos, and production agents.
- API routes for listing templates, creating budgets from templates, and simulating spend.
- SDK methods for the new budget workflows.

## Paywall Any Express Route

```js
import express from 'express';
import { meterflowPaywall } from '@meterflow/sdk/express';

const app = express();

app.use(meterflowPaywall({
  route: '/api/risk-score',
  method: 'POST',
  priceUsd: 0.006,
  payTo: process.env.SETTLEMENT_WALLET,
  description: 'Token risk score paid through Meterflow',
  async verify(req) {
    // Plug in hosted Meterflow/x402 verification or a custom verifier here.
    return Boolean(req.headers['x-payment']);
  },
}));

app.post('/api/risk-score', async (req, res) => {
  res.json({ score: 82, paid: req.meterflow?.paymentVerified });
});
```

The middleware returns a standard `402 payment_required` quote when no proof is present. It supports an optional `verify(req)` hook so this helper can evolve into full hosted/local settlement without changing the builder-facing route declaration.

## Register A Meter From Code

```js
import { registerMeterflowRoute } from '@meterflow/sdk/express';

await registerMeterflowRoute({
  apiKey: process.env.METERFLOW_API_KEY,
  route: '/api/risk-score',
  method: 'POST',
  priceUsd: 0.006,
  payTo: process.env.SETTLEMENT_WALLET,
  status: 'test',
});
```

## CLI

```bash
export METERFLOW_API_KEY=mf_xxxxx

meterflow meters
meterflow create-meter --route /api/risk-score --price 0.006 --method POST
meterflow receipts --limit 25
meterflow budget-templates
meterflow create-budget --template research_agent --agent market-bot
meterflow simulate-budget --daily-cap 5 --per-call-cap 0.02 --calls 120
meterflow publish-mcp --name token-risk --route /mcp/token-risk --price 0.006
```

## Budget Templates

Available templates:

| Template | Best for | Daily cap | Per-call cap |
| --- | --- | ---: | ---: |
| `research_agent` | Data, search, social, and token intelligence agents | $5 | $0.02 |
| `token_risk_agent` | Token scanners and wallet/token enrichment | $12 | $0.05 |
| `trading_bot` | Trading analysis and execution-adjacent data | $25 | $0.10 |
| `hackathon_demo` | Judges, public demos, and low-risk testing | $2 | $0.01 |
| `production_agent` | Monitored production workflows | $100 | $0.25 |

## SDK Budget Workflow

```js
import { MeterflowClient } from '@meterflow/sdk';

const meterflow = new MeterflowClient({ apiKey: process.env.METERFLOW_API_KEY });

const templates = await meterflow.budgetTemplates();

const simulation = await meterflow.simulateBudget({
  dailyCapUsd: 5,
  perCallCapUsd: 0.02,
  callsPerDay: 120,
});

const budget = await meterflow.createBudgetFromTemplate({
  templateId: 'research_agent',
  overrides: {
    agentId: 'market-bot',
    dailyCapUsd: 10,
  },
});
```

## API Routes

```http
GET /v1/budget-templates
GET /v1/budget-templates/:id
POST /v1/budgets/simulate
POST /v1/budgets/from-template
```

`POST /v1/budgets/from-template` requires a Meterflow API key. The other routes are safe public product/config helpers.

## Next v2 Slices

1. Full hosted x402 verification helper for the Express middleware.
2. Next.js, Fastify, Hono, Cloudflare Workers, and Vercel adapters.
3. Public provider registry with latency, uptime, price, total calls, and sample receipt.
4. Public receipt viewer by receipt id or transaction signature.
5. Provider refund/retry policies for failed responses.
6. Integrations: Helius first, then Jupiter, Pyth, Drift, Jito, Squads, and wallet UX integrations.
