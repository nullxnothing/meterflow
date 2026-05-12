# Paid MCP Tool Example

Meterflow treats MCP tools as meters. A builder can register a tool route, attach a price, and let agents pay per call with Solana USDC through x402-style HTTP 402 responses.

## Register a tool

```js
import { MeterflowClient } from '../../sdk/src/client.js';

const client = new MeterflowClient({ apiKey: process.env.METERFLOW_API_KEY });

const { tool } = await client.createMcpTool({
  name: 'company-search',
  manifestUrl: 'https://example.com/mcp/manifest.json',
  route: '/mcp/company-search',
  priceUsd: 0.02,
  status: 'test',
});

console.log(tool.route);
```

## Flow

1. Agent calls the Meterflow-protected MCP route.
2. Meterflow returns `402 Payment Required` with Solana USDC terms when no key or payment is present.
3. The agent retries with an x402 payment proof.
4. Meterflow verifies settlement, runs the tool, and records a receipt.

The built-in `/mcp/token-risk` route is a demo of this pattern; production builders should create their own meter or hosted gateway route.
