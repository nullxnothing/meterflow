<p align="center">
  <img src="assets/banner.png" alt="INFINITE Protocol" />
</p>

<p align="center">
  <strong>Token-gated AI API access on Solana.</strong><br>
  Hold $INFINITE. Use Claude, Gemini, and AI trading tools — funded by pump.fun creator fees. Forever.
</p>

<p align="center">
  <a href="https://infinite.sh">Website</a> &nbsp;·&nbsp;
  <a href="https://discord.gg/UGPwBKXV">Discord</a> &nbsp;·&nbsp;
  <a href="https://x.com/infinitexkeys">X / Twitter</a>
</p>

---

## How It Works

1. **Buy $INFINITE** on pump.fun
2. **Connect your wallet** at [infinite.sh/dashboard](https://infinite.sh/dashboard)
3. **Get an API key** — tier based on your token balance
4. **Use AI** — Claude, Gemini, multi-model, image gen, trading tools

Creator fees from pump.fun trading fund the API treasury (40% dev / 50% treasury / 10% community). As long as the token trades, the API runs.

## Tier System

| Tier | Min Holdings | Daily Calls | Models |
|---|---|---|---|
| **Signal** | 10,000 $INF | 1,000 | Claude Sonnet, Gemini Flash |
| **Operator** | 100,000 $INF | 10,000 | + Gemini Pro |
| **Architect** | 1,000,000 $INF | Unlimited | + Claude Opus, all future models |

## Features

- **Multi-model endpoint** — send one prompt to up to 4 models simultaneously, get all responses back
- **Streaming** — full SSE streaming with agentic tool-use loops
- **Image generation** — DALL-E and future providers
- **AI trading tools** — wallet tracking, launch scanning, DCA, copy trading
- **Treasury agent** — autonomous daemon that monitors SOL balance, adjusts rate limits, and reports health
- **Transparent treasury** — on-chain, publicly auditable, live stats on dashboard

## Quick Start

```bash
# API Proxy
cd api-proxy
cp .env.example .env   # fill in your keys
npm install && npm run dev

# Treasury Agent
cd agent
cp .env.example .env
npm install && node index.js
```

## API Usage

```bash
# Register (after connecting wallet on dashboard)
curl -X POST https://infinite.sh/proxy/auth/register \
  -H "Content-Type: application/json" \
  -d '{"wallet":"YOUR_WALLET","signature":"SIGNED_MSG","message":"Sign to access INFINITE"}'

# Chat completion
curl -X POST https://infinite.sh/proxy/v1/chat \
  -H "Authorization: Bearer inf_your_key" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-5-20250929","messages":[{"role":"user","content":"Hello"}]}'

# Multi-model (unique to INFINITE)
curl -X POST https://infinite.sh/proxy/v1/multi \
  -H "Authorization: Bearer inf_your_key" \
  -H "Content-Type: application/json" \
  -d '{"models":["claude-sonnet-4-5-20250929","gemini-2.5-flash"],"messages":[{"role":"user","content":"Hello"}]}'
```

## Project Structure

```
api-proxy/      → Express server: auth, rate limiting, AI proxy
agent/          → Treasury agent daemon + OpenClaw skills
dashboard/      → Holder dashboard (wallet connect, usage, trading)
site/           → Landing page + explainer
sdk/            → Zero-dependency JS/TS SDK
discord-bot/    → Community Discord bot
```

## License

MIT
