# @meterflow/sdk

SDK for Meterflow, a Solana-native payment, metering, receipt, and budget control plane for third-party APIs, MCP tools, and agent operators.

Zero dependencies. Works in Node.js 18+ and modern browsers.

## Install

```bash
npm install @meterflow/sdk
```

## Quick Start

```js
import { MeterflowClient } from '@meterflow/sdk';

const client = new MeterflowClient({
  apiKey: 'mf_xxxxx',
});

const { meter } = await client.createHostedMeter({
  targetUrl: 'https://api.example.com',
  method: 'GET',
  unit: 'lookup',
  priceUsd: 0.01,
  providerName: 'Example Data API',
  status: 'test',
});

console.log(meter.route);
console.log(await client.testMeter(meter.id));
```

`MeterflowClient` is the canonical client export. New integrations should use the hosted meter, receipt, budget, MCP tool, provider revenue, and webhook helpers.

## API

### `new MeterflowClient(config)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | required | Your Meterflow API key (`mf_xxxxx`) |
| `baseUrl` | `string` | `https://meterflow.fun/proxy` | API base URL |
| `timeout` | `number` | `30000` | Request timeout in ms |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `createHostedMeter(params)` | `Promise<Object>` | Wrap an external API behind a Meterflow hosted gateway |
| `testMeter(meterId)` | `Promise<Object>` | Preview hosted route, target host, quote, and billable state |
| `status()` | `Promise<Object>` | Current key, wallet, usage, and service route access |
| `treasury()` | `Promise<TreasuryStatus>` | Settlement wallet context |
| `providers()` | `Promise<Object>` | Available AI providers |
| `meters()` | `Promise<Object>` | List metered API/MCP products |
| `createMeter(params)` | `Promise<Object>` | Create a route-level or hosted gateway meter |
| `deleteMeter(meterId)` | `Promise<Object>` | Delete a custom meter |
| `receipts(params)` | `Promise<Object>` | List request receipts |
| `budgets()` | `Promise<Object>` | List agent budget policies |
| `createBudget(params)` | `Promise<Object>` | Create a spend-control policy |
| `revokeBudget(budgetId)` | `Promise<Object>` | Revoke an active spend-control policy |
| `createMcpTool(params)` | `Promise<Object>` | Package an MCP tool behind Meterflow |
| `deleteMcpTool(toolId)` | `Promise<Object>` | Delete a packaged MCP tool |
| `webhooks()` | `Promise<Object>` | List webhook endpoints |
| `createWebhook(params)` | `Promise<Object>` | Create a webhook endpoint |
| `testWebhook(webhookId)` | `Promise<Object>` | Send a test webhook event |
| `deleteWebhook(webhookId)` | `Promise<Object>` | Delete a webhook endpoint |
| `providerRevenue()` | `Promise<Object>` | Revenue and failure aggregates by meter |

## Hosted Provider Example

```js
const meter = await client.createHostedMeter({
  targetUrl: 'https://api.example.com',
  method: 'GET',
  unit: 'request',
  priceUsd: 0.01,
  providerName: 'Example API',
});

const budget = await client.createBudget({
  name: 'research-agent',
  dailyCapUsd: 12,
  perCallCapUsd: 0.02,
  allowedMeterIds: ['mtr_mcp_token_risk', meter.meter.id],
});

const tool = await client.createMcpTool({
  name: 'Token Risk Score',
  route: '/mcp/token-risk',
  priceUsd: 0.006,
});

const receipts = await client.receipts({ limit: 25 });
const revenue = await client.providerRevenue();

await client.revokeBudget(budget.budget.id);
await client.deleteMcpTool(tool.tool.id);
await client.deleteMeter(meter.meter.id);
```

## Meterflow Model

Meterflow uses wallet identity for operator setup and API keys for agent/server calls. Gateway routes are treated as metered services so usage can be connected to receipts, settlement context, and budget policies in the dashboard. USDC is the payment asset; MFLOW is the utility layer for provider reputation, discounts, registry ranking, higher limits, retention, and future bonding.

x402-paid receipts are wallet-visible: when a wallet pays a protected route, the dashboard and `/v1/receipts` show those receipts to the paying wallet after registration, even when the route was served through the shared x402 gateway.

## License

MIT
