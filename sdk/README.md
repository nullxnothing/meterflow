# @meterflow/sdk

SDK for Meterflow, a Solana-native metering gateway for AI agents, APIs, MCP tools, and data feeds.

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

const response = await client.chat({
  model: 'claude-sonnet-4-6',
  messages: [{ role: 'user', content: 'Explain x402 on Solana' }],
});

const stream = client.chatStream({
  model: 'gemini-2.5-flash',
  messages: [{ role: 'user', content: 'Write a haiku' }],
});
for await (const event of stream) {
  if (event.type === 'content_delta') process.stdout.write(event.text);
}

const multi = await client.multi({
  models: ['claude-sonnet-4-6', 'gemini-2.5-flash'],
  messages: [{ role: 'user', content: 'What should agents pay for on Solana?' }],
});
multi.responses.forEach(r => console.log(`${r.model}: ${r.content?.[0]?.text || ''}`));
```

`MeterflowClient` is the canonical client export.

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
| `chat(params)` | `Promise<ChatResponse>` | Single model chat completion |
| `chatStream(params)` | `AsyncGenerator<StreamEvent>` | Streaming chat completion |
| `multi(params)` | `Promise<MultiResponse>` | Parallel multi-model inference |
| `multiStream(params)` | `AsyncGenerator<MultiStreamEvent>` | Streaming multi-model |
| `image(params)` | `Promise<Object>` | Image generation |
| `status()` | `Promise<Object>` | Current key, wallet, usage, and service route access |
| `treasury()` | `Promise<TreasuryStatus>` | Settlement wallet context |
| `providers()` | `Promise<Object>` | Available AI providers |
| `meters()` | `Promise<Object>` | List metered API/MCP products |
| `createMeter(params)` | `Promise<Object>` | Create a route-level meter |
| `receipts(params)` | `Promise<Object>` | List request receipts |
| `budgets()` | `Promise<Object>` | List agent budget policies |
| `createBudget(params)` | `Promise<Object>` | Create a spend-control policy |
| `createMcpTool(params)` | `Promise<Object>` | Package an MCP tool behind Meterflow |
| `providerRevenue()` | `Promise<Object>` | Revenue and failure aggregates by meter |

## Control Plane Example

```js
await client.createMeter({
  route: '/v1/risk-score',
  method: 'POST',
  unit: 'request',
  priceUsd: 0.006,
});

await client.createBudget({
  name: 'research-agent',
  dailyCapUsd: 12,
  perCallCapUsd: 0.02,
  allowedMeterIds: ['mtr_chat', 'mtr_multi'],
});

const receipts = await client.receipts({ status: 'metered_key', limit: 25 });
const revenue = await client.providerRevenue();
```

## Meterflow Model

Meterflow uses wallet identity for operator setup and API keys for agent/server calls. Gateway routes are treated as metered services so usage can be connected to receipts, settlement context, and budget policies in the dashboard. USDC is the payment asset; MFLOW is the utility layer for provider reputation, discounts, registry ranking, higher limits, retention, and future bonding.

## License

MIT
