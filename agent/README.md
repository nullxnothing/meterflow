# Meterflow Agent Example

This package is a reference agent that connects to Meterflow as a paid API consumer. It is not the main product surface. Use it to test wallet-bound budgets, metered service routes, MCP tools, and receipt tracking from an automated client.

## What It Demonstrates

- Connecting an agent wallet to the Meterflow control plane
- Calling paid routes through the Meterflow gateway
- Respecting per-agent spend limits and route policies
- Recording request receipts for dashboard inspection
- Sending operational status back to Discord, Telegram, or other team channels

## Prerequisites

- A Solana wallet dedicated to the agent
- Access to the Meterflow dashboard at [meterflow.fun](https://meterflow.fun)
- A Meterflow client key or wallet-bound budget policy
- Helius RPC credentials for wallet and receipt monitoring
- Optional model/provider keys for routes the agent is allowed to call

## Quick Start

```bash
cd agent
cp .env.example .env
npm install
npm start
```

Set the required environment variables in `.env`:

- `METERFLOW_API_BASE` - Meterflow gateway URL, defaults to `https://meterflow.fun/proxy`
- `METERFLOW_API_KEY` - Client key issued from the dashboard
- `SOLANA_PRIVATE_KEY` - Base58 private key for the agent wallet
- `HELIUS_API_KEY` - RPC key for Solana account reads
- `AGENT_NAME` - Display name shown in receipts and budget logs

## Dashboard Flow

1. Connect the admin wallet in the Meterflow dashboard.
2. Create a meter for each route the agent can call.
3. Create an agent budget with daily spend and allowed route limits.
4. Add or rotate the agent client key.
5. Run the agent and inspect receipts in the `Receipts` tab.

## File Structure

```text
agent/
├── README.md
├── openclaw.json
├── index.js
├── package.json
├── .env.example
└── skills/
    ├── privacy-cards/
    └── trend-scanner/
```

Keep this folder focused on integration examples. Product documentation lives in the root README, `site/docs.html`, and the Meterflow dashboard.
