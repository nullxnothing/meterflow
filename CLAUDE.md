# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

INFINITE Protocol — token-gated AI API access on Solana. Holders of $INFINITE get access to Claude and Gemini APIs funded by pump.fun creator fees. The creator fee splits 40% dev / 50% API treasury / 10% community.

## Architecture

Three independent services + static frontends:

1. **API Proxy** (`api-proxy/server.js`) — Express server that authenticates users via Solana wallet signature, checks $INFINITE token balance via Helius RPC, assigns tier-based rate limits, and proxies requests to Anthropic/Google APIs with master keys. Runs on port 3001. All state is in-memory Maps (apiKeys, walletKeys, usageCounts, balanceCache) — no database yet.

2. **Treasury Agent** (`agent/index.js`) — Autonomous Node.js daemon that monitors the treasury wallet's SOL balance, calculates API budget runway, dynamically adjusts rate limit multipliers, and pushes updates to the proxy via `POST /admin/rate-limits`. Also exposes OpenClaw skills interface. Runs health server on port 3002. Gets SOL price from Jupiter API.

3. **Static Frontend** — Three HTML files served via Vercel rewrites:
   - `site/index.html` → `/` (landing page)
   - `site/how-it-works.html` → `/how-it-works`
   - `dashboard/index.html` → `/dashboard` (holder dashboard with wallet connect, API key management, usage tracking)

## Key Data Flow

```
Wallet signs message → POST /auth/register → Helius balance check → Tier assignment → API key (inf_xxxxx) issued
↓
POST /v1/chat with Bearer token → Auth middleware re-checks balance → Rate limit check → Proxy to Anthropic or Gemini
↓
Treasury agent monitors SOL wallet → Calculates runway days → Pushes multiplier to proxy /admin/rate-limits
```

## Tier System

- **Signal**: 10K tokens, 1K calls/day, Claude Sonnet + Gemini Flash
- **Operator**: 100K tokens, 10K calls/day, + Gemini Pro
- **Architect**: 1M tokens, unlimited, + Claude Opus

## Development Commands

```bash
# API Proxy
cd api-proxy
cp .env.example .env    # Fill in Helius, Anthropic, Google keys
npm install
npm run dev             # Uses node --watch for auto-reload

# Treasury Agent
cd agent
cp .env.example .env    # Fill in Helius RPC, treasury wallet, admin key
npm install
node index.js           # Starts daemon + health server on :3002

# Static sites — open HTML files directly or deploy to Vercel
```

## Important Details

- Both `api-proxy/server.js` and `agent/index.js` use ES module syntax (`import`/`export`). The package.json files likely need `"type": "module"`.
- Signature verification in `/auth/register` is stubbed out (TODO comment at line ~208 of server.js) — tweetnacl + bs58 are dependencies but not wired up yet.
- The proxy currently has no streaming support — the `stream` param in `/v1/chat` is destructured but unused.
- The dashboard uses hardcoded demo data (`DEMO` object) instead of real wallet adapter integration. `connectWallet()` just copies demo state.
- Balance cache TTL is 5 minutes. Treasury agent checks balance every 5 minutes, SOL price every 15 minutes.
- Admin auth for treasury agent push uses `ADMIN_KEY` env var (defaults to `dev-admin-key`).
- The treasury agent health status determines rate limit multiplier: surplus (1.5x), healthy (1.0x), cautious (0.7x), critical (0.3x).
- `vercel.json` handles routing rewrites. Vercel org ID is in `.vercel/project.json`.

## Design Tokens (Shared Across All HTML)

All three HTML pages share the same CSS variables — accent is `#c8ff00`, bg is `#0a0a0a`. Fonts: DM Serif Display (headings), Sora (body), JetBrains Mono (code/UI).
