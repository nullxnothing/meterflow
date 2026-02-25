# INFINITE Protocol

**Token-gated AI API access on Solana.**
Hold $INFINITE. Use Claude, Gemini, and AI trading tools — funded by pump.fun creator fees. Forever.

[Website](https://infinitekeys.fun) | [Dashboard](https://infinitekeys.fun/dashboard) | [Docs](https://infinitekeys.fun/docs) | [Discord](https://discord.gg/UGPwBKXV) | [Twitter](https://x.com/infinitexkeys) | [pump.fun](https://pump.fun/coin/DhsN1JmBZCvcL9P7cK1R9NLy5VB1kQcecUG7JbKQpump)

---

## The Problem

AI API access costs $20-200/month per service. Most builders can't afford Claude + GPT + Gemini simultaneously. Subscriptions expire, credit cards get declined, and there's no composability between providers.

## The Solution

Buy $INFINITE once on Solana. Connect your wallet. Get API keys for every major AI model. Creator fees from every trade fund a shared AI treasury — the more the token trades, the more API capacity everyone gets. No subscriptions. No credit cards. Self-sustaining.

## How It Works

```
Buy $INFINITE on Solana
       │
       ▼
Connect wallet at infinitekeys.fun
       │
       ▼
Get API keys for Claude, GPT, Gemini
       │
       ▼
Every trade generates pump.fun creator fees
       │
       ▼
Fees flow into AI API treasury
       │
       ▼
Treasury funds API access for all holders
       │
       ▼
Self-sustaining loop
```

## Tier System

| Tier | Min Holdings | Daily Calls | Models |
|------|-------------|------------|--------|
| **Signal** | 10,000 $INF | 1,000 | Claude Sonnet, Gemini Flash, GPT-4o Mini |
| **Operator** | 100,000 $INF | 10,000 | + Gemini Pro, GPT-4o |
| **Architect** | 1,000,000 $INF | Unlimited | + Claude Opus, all future models |

## Features

- **Multi-model endpoint** — send one prompt to up to 4 models simultaneously
- **Full streaming** — SSE streaming with agentic tool-use support
- **Image generation** — DALL-E integration with future providers planned
- **AI trading tools** — wallet tracking, launch scanning, DCA, copy trading
- **Self-sustaining treasury agent** — autonomous daemon that earns its own revenue
- **Transparent treasury** — on-chain, publicly auditable, live stats on dashboard
- **Chrome extension** — sidebar AI assistant powered by your holder API key
- **Zero-dependency SDK** — JS/TS client with streaming and multi-model support

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      INFINITE Protocol                        │
│                                                               │
│  site/            dashboard/           extension/             │
│  Landing page     Holder panel         Chrome sidebar         │
│                   AI chat, images      AI assistant            │
│                   Trading tools                                │
│       └──────────────┼──────────────────┘                     │
│                      ▼                                        │
│             ┌─────────────────┐                               │
│             │   api-proxy/    │                               │
│             │  Wallet auth    │                               │
│             │  Token gating   │                               │
│             │  Rate limiting  │                               │
│             │  Multi-model    │                               │
│             └───────┬─────────┘                               │
│                     │                                         │
│          ┌──────────┼──────────┐                              │
│          ▼          ▼          ▼                               │
│       Claude     Gemini      GPT                              │
│      Anthropic   Google     OpenAI                            │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐   │
│  │               Autonomous Agent Layer                    │   │
│  │                                                         │   │
│  │  agent/                twitter-bot/     discord-bot/    │   │
│  │  Self-funding loop:    ElizaOS agent    Community       │   │
│  │  scan trends →         Twitter CT       Discord         │   │
│  │  launch token →        engagement       integration     │   │
│  │  earn fees →                                            │   │
│  │  swap SOL→USDC →                                       │   │
│  │  fund own APIs                                          │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  sdk/                    Treasury Pipeline                    │
│  JS/TS SDK               SOL fees → Jupiter → USDC           │
│  Zero deps               USDC → Skyfire API credits           │
│  Streaming               USDC → Privacy.com vendor cards      │
│  Multi-model             Agent funds its own existence         │
└──────────────────────────────────────────────────────────────┘
```

## Project Structure

| Directory | Description |
|-----------|-------------|
| `api-proxy/` | Express server — wallet auth, token gating, rate limiting, multi-model AI routing |
| `agent/` | Self-sustaining OpenClaw agent — scans trends, launches tokens, earns fees, funds its own AI |
| `dashboard/` | Holder dashboard — AI chat, image gen, video gen, trading tools, treasury view |
| `site/` | Landing page and product explainer |
| `sdk/` | Zero-dependency JS/TS SDK with streaming and multi-model support |
| `twitter-bot/` | Automated Twitter engagement with safety filters |
| `discord-bot/` | Community Discord bot with AI-powered responses |
| `extension/` | Chrome extension — sidebar AI assistant for any webpage |
| `skills/` | OpenClaw skill definitions for the agent marketplace |

## Self-Sustaining Agent

The treasury agent runs a closed economic loop — it earns revenue to pay for its own reasoning:

```
SCAN trends → LAUNCH token on pump.fun → EARN creator fees (SOL)
     ↑                                           ↓
THINK (LLM) ← USE API credits ← DEPOSIT USDC ← SWAP SOL→USDC via Jupiter
```

| Skill | Purpose | Schedule |
|-------|---------|----------|
| `wallet-monitor` | Tracks SOL balance and incoming creator rewards via Helius | Every 15 min |
| `trend-scanner` | Scans HN, Reddit, Google Trends for token-worthy narratives | Every 2 hours |
| `pump-deployer` | Deploys tokens on pump.fun with auto-generated metadata | Every 4 hours |
| `jupiter-swap` | Converts excess SOL to USDC via Jupiter V6 aggregator | Triggered |
| `skyfire-fund` | Deposits USDC into Skyfire for API credit purchasing | Triggered |

**Startup cost:** ~$85 (0.5 SOL + $10 USDC). One modestly viral token launch covers weeks of operation.

## SDK Quick Start

```js
import { InfiniteClient } from '@infinite-protocol/sdk';

const client = new InfiniteClient({ apiKey: 'inf_xxxxx' });

// Single model
const res = await client.chat({
  model: 'claude-sonnet-4-5-20250929',
  messages: [{ role: 'user', content: 'Hello!' }],
});

// Multi-model (unique to INFINITE — query multiple LLMs in parallel)
const multi = await client.multi({
  models: ['claude-sonnet-4-5-20250929', 'gemini-2.5-flash'],
  messages: [{ role: 'user', content: 'What is Solana?' }],
});

// Streaming
const stream = client.chatStream({
  model: 'gemini-2.5-flash',
  messages: [{ role: 'user', content: 'Write a haiku' }],
});
for await (const event of stream) {
  if (event.type === 'content_delta') process.stdout.write(event.text);
}
```

## Quick Start

```bash
# API Proxy
cd api-proxy
cp .env.example .env   # fill in your keys
npm install && npm run dev

# Treasury Agent (Docker)
cd agent
cp .env.example .env
docker compose -f railway/docker-compose.yml up --build
```

## Deploy the Agent

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https://github.com/kaelxsol/infinite-protocol&envs=OPENCLAW_GATEWAY_TOKEN,SKYFIRE_API_KEY,SOLANA_PRIVATE_KEY,HELIUS_API_KEY,ANTHROPIC_API_KEY)

Set the required env vars, fund the agent wallet with 0.5 SOL and Skyfire with $10 USDC, and the agent takes over from there.

## Built With

[Solana](https://solana.com) | [pump.fun](https://pump.fun) | [Jupiter](https://jup.ag) | [Skyfire](https://skyfire.xyz) | [OpenClaw](https://github.com/openclaw) | [Helius](https://helius.dev) | [ElizaOS](https://elizaos.ai) | [Privacy.com](https://privacy.com) | [Bridge.xyz](https://bridge.xyz) | [Anthropic](https://anthropic.com) | [Google Gemini](https://deepmind.google/technologies/gemini/) | [OpenAI](https://openai.com)

## License

MIT
