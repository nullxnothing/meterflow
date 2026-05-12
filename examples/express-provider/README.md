# Express Provider Example

This example shows how an API provider can expose an existing Express endpoint through Meterflow as a Solana USDC paid route.

## 1. Run a provider API

```bash
cp .env.example .env
npm install express
node server.js
```

## 2. Create a hosted Meterflow meter

```js
import { MeterflowClient } from '../../sdk/src/client.js';

const client = new MeterflowClient({ apiKey: process.env.METERFLOW_API_KEY });

const { meter } = await client.createHostedMeter({
  targetUrl: process.env.PROVIDER_TARGET_URL,
  method: 'GET',
  priceUsd: 0.01,
  unit: 'weather lookup',
  providerName: 'Example Weather API',
  status: 'test',
});

console.log(meter.route); // /gateway/mtr_xxxxx/*
console.log(await client.testMeter(meter.id));
```

Consumers can call `https://meterflow.fun/proxy${meter.route.replace('*', 'forecast')}`. Meterflow handles API keys, x402 quotes, receipts, budgets, and provider revenue.
