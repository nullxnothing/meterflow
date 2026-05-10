# Meterflow v2 Builder Guide

Meterflow v2 moves the product toward one core promise:

> Turn any API, MCP tool, data feed, model call, or workflow into a paid USDC endpoint with agent-safe budgets and receipts.

This guide documents the first v2 implementation slices on the `v2` branch.

## What v2 Adds First

- Express paywall middleware for declaring paid API routes in builder apps.
- CLI workflows for meters, receipts, budget templates, budget simulation, MCP publishing, registry discovery, public receipts, and integrations.
- Prebuilt agent budget templates for research agents, token-risk agents, trading bots, hackathon demos, and production agents.
- API routes for listing templates, creating budgets from templates, simulating spend, public registry discovery, public-safe receipt lookup, and integration plans.
- SDK methods for budget workflows, registry discovery, public receipt lookup, and integration discovery.

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
meterflow registry --category mcp-tool
meterflow registry-item --id mtr_mcp_token_risk
meterflow public-receipt --id rcpt_xxxxx
meterflow public-tx --signature 5N...
meterflow integrations --priority highest
meterflow integration --id helius
meterflow budget-templates
meterflow create-budget --template research_agent --agent market-bot
meterflow simulate-budget --daily-cap 5 --per-call-cap 0.02 --calls 120
meterflow publish-mcp --name token-risk --route /mcp/token-risk --price 0.006
```

Registry, public receipt, and integration commands can run without `METERFLOW_API_KEY` because they call public-safe endpoints.

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

## Public Registry

The public registry is the first version of the marketplace/discovery layer. It exposes paid routes and MCP tools with public-safe metadata:

- route and method
- unit and price
- asset
- category
- masked provider wallet
- verified provider flag
- total calls
- paid calls
- failed calls
- success rate
- verified revenue
- estimated gross revenue
- average and p95 latency when available
- sample curl command

```js
const registry = await meterflow.registry({ category: 'mcp-tool' });
const item = await meterflow.registryItem('mtr_mcp_token_risk');
```

## Public Receipts

Public receipt lookups are designed for proof without leaking API key or private customer context. Wallets are masked, but payment state, amount, route, policy result, response status, latency, and transaction signature remain visible.

```js
const receipt = await meterflow.publicReceipt('rcpt_xxxxx');
const receiptByTx = await meterflow.publicReceiptByTx('5N...');
```

## Integration Catalog

The integration catalog turns the expansion plan into product data that the site/dashboard can render. Current planned integrations include Helius, Jupiter, Pyth, Drift, Jito, Squads, wallet UX, alerts, Metaplex, Light Protocol, and Streamflow.

```js
const integrations = await meterflow.integrations({ priority: 'highest' });
const helius = await meterflow.integration('helius');
```

## API Routes

```http
GET /v1/budget-templates
GET /v1/budget-templates/:id
POST /v1/budgets/simulate
POST /v1/budgets/from-template
GET /v1/registry
GET /v1/registry/:id
GET /v1/public/receipts/:id
GET /v1/public/tx/:signature
GET /v1/integrations
GET /v1/integrations/:id
```

`POST /v1/budgets/from-template` requires a Meterflow API key. Registry, public receipt, integration, template, and simulation routes are public-safe product/config helpers.

## Next v2 Slices

1. Full hosted x402 verification helper for the Express middleware.
2. Next.js, Fastify, Hono, Cloudflare Workers, and Vercel adapters.
3. Public registry UI inside the site/dashboard.
4. Public receipt viewer page by receipt id or transaction signature.
5. Provider refund/retry policies for failed responses.
6. First live integration: Helius-powered paid data routes.
