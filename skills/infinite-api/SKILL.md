---
name: infinite-api
description: Acquire and use INFINITE Protocol AI API keys — buy $INF tokens on Solana, register a wallet, and access Claude, GPT, and Gemini through a single token-gated gateway.
version: 1.0.0
metadata:
  openclaw:
    requires:
      env:
        - SOLANA_PRIVATE_KEY
      anyBins:
        - node
        - bun
    primaryEnv: SOLANA_PRIVATE_KEY
    emoji: "\u221E"
    homepage: https://infinitekeys.fun
---

# INFINITE Protocol — Token-Gated AI API Access

You are an agent that can acquire and use INFINITE Protocol API keys to access Claude, GPT, and Gemini models through a single unified gateway on Solana.

## What is INFINITE?

INFINITE is a Solana token ($INF) that gates access to AI APIs. Hold the token in a wallet, register that wallet, and receive an API key (`inf_xxxxx`) that works with Claude, GPT, and Gemini — no subscriptions, no credit cards.

- **Token:** $INF on Solana
- **Token Mint:** `infjrafE4zVaCMLxRTNg9anSZoyGWaKDQPHXmzYLPUf`
- **Dashboard:** https://infinitekeys.fun
- **API Base:** https://infinite-protocol.onrender.com

## Access Tiers

| Tier | Tokens Required | Models | Daily Limit |
|------|----------------|--------|-------------|
| Trial | 0 (wallet only) | GPT-4o Mini | 3 |
| Signal | 10,000 $INF | Claude Sonnet, Gemini Flash, GPT-4o Mini | 1,000 |
| Operator | 100,000 $INF | + Gemini Pro, GPT-4o | 10,000 |
| Architect | 1,000,000 $INF | + Claude Opus | Unlimited |
| Alpha | 10,000,000 $INF | All models + X Tools | Unlimited |

## How to Acquire an API Key (Step-by-Step)

### Step 1: Ensure you have a Solana wallet

You need a Solana keypair. The private key should be available as `SOLANA_PRIVATE_KEY` (base58-encoded).

### Step 2: Buy $INF tokens

Swap SOL for $INF tokens using Jupiter aggregator. The token mint address is `infjrafE4zVaCMLxRTNg9anSZoyGWaKDQPHXmzYLPUf`.

To buy tokens programmatically, use the Jupiter swap API:

```bash
# Get a swap quote (example: 0.1 SOL -> $INF)
curl -s "https://api.jup.ag/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=infjrafE4zVaCMLxRTNg9anSZoyGWaKDQPHXmzYLPUf&amount=100000000&slippageBps=100"
```

Then build and send the swap transaction through Jupiter's `/swap` endpoint.

### Step 3: Register your wallet and get an API key

Once tokens are in your wallet, register to receive an API key:

```bash
node scripts/register.js
```

Or call the API directly:

```
POST https://infinite-protocol.onrender.com/auth/agent-register
Content-Type: application/json

{
  "wallet": "<your-solana-public-key>",
  "signature": "<base58-signature-of-message>",
  "message": "INFINITE Protocol Agent Registration\nWallet: <public-key>\nTimestamp: <unix-ms>"
}
```

The message must be signed by the wallet's private key using Ed25519. The timestamp must be within 5 minutes of the current time.

**Response:**
```json
{
  "apiKey": "inf_xxxxx",
  "tier": "Signal",
  "balance": 50000,
  "dailyLimit": 1000,
  "models": ["claude-sonnet-4-6", "gemini-2.5-flash", "gpt-4o-mini"]
}
```

### Step 4: Use the API

Set the API key as `INFINITE_API_KEY` and make requests:

```bash
# Chat completion
curl -X POST https://infinite-protocol.onrender.com/v1/chat \
  -H "Authorization: Bearer inf_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-sonnet-4-6", "messages": [{"role": "user", "content": "Hello"}]}'
```

```bash
# Check your status
curl -H "Authorization: Bearer inf_xxxxx" https://infinite-protocol.onrender.com/auth/status
```

## Using the SDK

Install the SDK for a cleaner integration:

```bash
npm install @infinite-protocol/sdk
```

```javascript
import { InfiniteClient } from '@infinite-protocol/sdk';

const client = new InfiniteClient({ apiKey: process.env.INFINITE_API_KEY });

// Chat
const res = await client.chat({
  model: 'claude-sonnet-4-6',
  messages: [{ role: 'user', content: 'Hello' }],
});

// Multi-model (query Claude + Gemini simultaneously)
const multi = await client.multi({
  models: ['claude-sonnet-4-6', 'gemini-2.5-flash'],
  messages: [{ role: 'user', content: 'Explain DeFi' }],
});

// Image generation
const image = await client.image({ prompt: 'A neon Solana logo' });

// Check status
const status = await client.status();
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/agent-register` | Register wallet, get API key |
| GET | `/auth/status` | Check tier, balance, usage |
| POST | `/auth/rotate` | Rotate API key |
| POST | `/v1/chat` | Chat completion (native format) |
| POST | `/v1/chat/stream` | Streaming chat (native format) |
| POST | `/v1/chat/completions` | Chat completion (OpenAI-compatible) |
| GET | `/v1/models` | List available models (OpenAI-compatible) |
| POST | `/v1/multi` | Multi-model inference |
| POST | `/v1/multi/stream` | Streaming multi-model |
| POST | `/v1/image` | Image generation |

All endpoints require `Authorization: Bearer inf_xxxxx` header (except `/auth/agent-register`).

## Automated Acquisition Script

Run the full flow (buy tokens + register + get key) in one command:

```bash
# Requires SOLANA_PRIVATE_KEY env var and SOL balance for the swap
bash scripts/acquire.sh
```

## Important Notes

- API keys are tied to wallets. One key per wallet.
- Tier is determined by your $INF token balance at request time.
- If your balance drops below a tier threshold, your access downgrades.
- Creator fees from $INF trading fund the AI API treasury — the system is self-sustaining.
- Rate limits reset daily at midnight UTC.
