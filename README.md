# ∞ INFINITE Protocol

**Own the token. Use the AI. Forever.**

Token-gated AI API access on Solana. Holders get unlimited Claude, Gemini, and a suite of AI trading tools — funded entirely by pump.fun creator fees.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    $INFINITE Token                       │
│              (Deployed on pump.fun)                      │
│                                                         │
│  Creator Fee Split:                                     │
│  ├── 40% → Dev wallet                                   │
│  ├── 50% → API Treasury wallet                          │
│  └── 10% → Community wallet                             │
└──────────────────────┬──────────────────────────────────┘
                       │ SOL fees from trading
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  API Treasury Wallet                     │
│          (On-chain, publicly auditable)                  │
│                                                         │
│  OpenClaw Agent:                                        │
│  ├── Monitors treasury balance                          │
│  ├── Converts SOL → API credits                         │
│  ├── Adjusts rate limits based on runway                │
│  └── Reports status to dashboard                        │
└──────────────────────┬──────────────────────────────────┘
                       │ Funds API calls
                       ▼
┌─────────────────────────────────────────────────────────┐
│               INFINITE API Proxy                         │
│            (api.infinite.sh)                             │
│                                                         │
│  1. Receives request with inf_xxxxx key                 │
│  2. Verifies wallet balance via Helius                  │
│  3. Checks rate limits per tier                         │
│  4. Proxies to Claude/Gemini with master key            │
│  5. Returns response, tracks usage                      │
│                                                         │
│  Endpoints:                                             │
│  ├── POST /auth/register  — Wallet verify + key gen     │
│  ├── GET  /auth/status    — Check tier + usage          │
│  ├── POST /v1/chat        — AI completion proxy         │
│  ├── POST /auth/rotate    — Rotate API key              │
│  ├── POST /auth/revoke    — Revoke API key              │
│  └── GET  /stats          — Public protocol stats       │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │ Anthropic│ │  Google  │ │  Future  │
    │  Claude  │ │  Gemini  │ │ Providers│
    └──────────┘ └──────────┘ └──────────┘
```

## Tier System

| Tier       | Min Holdings  | Daily Calls | Models                          |
|------------|---------------|-------------|---------------------------------|
| Signal     | 10,000 $INF   | 1,000       | Claude Sonnet, Gemini Flash     |
| Operator   | 100,000 $INF  | 10,000      | + Gemini Pro                    |
| Architect  | 1,000,000 $INF| Unlimited   | + Claude Opus, all future       |

## Self-Sustaining Agent

INFINITE includes an autonomous OpenClaw agent that funds its own existence. The agent launches tokens on pump.fun, earns creator rewards, swaps SOL to USDC via Jupiter, and uses Skyfire to autonomously purchase its own API credits. Deploy to Railway with one click.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https://github.com/kaelxsol/infinite-protocol&envs=OPENCLAW_GATEWAY_TOKEN,SKYFIRE_API_KEY,SOLANA_PRIVATE_KEY,HELIUS_API_KEY,ANTHROPIC_API_KEY)

[-> Agent Setup Guide](./agent/README.md)

## Project Structure

```
infinite-protocol/
├── site/
│   ├── index.html              # Landing page (infinite.sh)
│   └── how-it-works.html       # Explainer page
├── dashboard/
│   └── index.html              # Holder dashboard (app.infinite.sh)
├── api-proxy/
│   ├── server.js               # Express proxy server
│   ├── .env.example            # Config template
│   └── package.json
├── agent/
│   ├── openclaw.json           # OpenClaw agent config + crons
│   ├── skills/                 # SKILL.md files for each capability
│   ├── railway/                # Dockerfile + Railway deployment
│   ├── index.js                # Treasury agent daemon (legacy)
│   └── .env.example
├── assets/                     # Brand + social graphics
├── docs/                       # Growth strategy + tweet copy
├── vercel.json                 # Vercel routing rewrites
└── README.md
```

## Deployment Plan

### Phase 1: Token Launch
1. Deploy $INFINITE on pump.fun
2. Set creator fee split: 40/50/10 (dev/treasury/community)
3. Publish landing page to infinite.sh
4. Announce on Twitter with live demo

### Phase 2: API Proxy
1. Deploy proxy server (Railway, Fly.io, or VPS)
2. Configure Helius API for balance checks
3. Set up Anthropic + Google API master keys
4. Add Redis for production rate limiting
5. Deploy dashboard to app.infinite.sh

### Phase 3: Tools
1. Wire up AI chat interface in dashboard
2. Integrate pre-built trading agents (wallet stalker, launch scanner)
3. Build Telegram bot for alerts
4. Launch community vault for user-submitted tools

### Phase 4: Treasury Agent
1. Deploy OpenClaw agent to manage treasury
2. Auto-convert SOL fees to API credits
3. Dynamic rate limit adjustment based on treasury health
4. Public treasury dashboard with real-time data

## Quick Start (Development)

```bash
# API Proxy
cd api-proxy
cp .env.example .env
# Fill in your keys
npm install
npm run dev

# Landing page — just open index.html
# Dashboard — just open dashboard/index.html
```

## API Usage

```bash
# Register (after connecting wallet on dashboard)
curl -X POST https://api.infinite.sh/auth/register \
  -H "Content-Type: application/json" \
  -d '{"wallet":"YOUR_WALLET","signature":"SIGNED_MSG","message":"Sign to access INFINITE"}'

# Make AI calls
curl -X POST https://api.infinite.sh/v1/chat \
  -H "Authorization: Bearer inf_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "messages": [{"role": "user", "content": "Analyze the top Solana movers today"}]
  }'

# Check status
curl https://api.infinite.sh/auth/status \
  -H "Authorization: Bearer inf_your_key"
```

## Economics

At $1M daily trading volume with 0.95% creator fee:
- **Daily treasury income:** ~$4,750 (50% of $9,500)
- **Cost per API call:** ~$0.01-0.03
- **Calls fundable per day:** ~150,000-475,000
- **Break-even users (Signal tier):** ~150-475

The math works at surprisingly low volume. Even at $100K daily volume, the treasury generates ~$475/day — enough for ~15,000-47,000 API calls.

---

Built by a Solana dev who got tired of paying for AI.
