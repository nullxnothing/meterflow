# INFINITE — Self-Sustaining AI Agent

An autonomous OpenClaw agent on Solana that funds its own existence. It identifies trending tech narratives, launches tokens on pump.fun, earns creator rewards in SOL, swaps to USDC via Jupiter, deposits into Skyfire, and uses those credits to power its own LLM reasoning. The loop runs indefinitely — the agent pays for itself.

## The Loop

```
  ┌─────────────────────────────────────────────────────┐
  │                                                     │
  │   SCAN            LAUNCH           EARN             │
  │   Trending   →    Token on    →    Creator          │
  │   topics          pump.fun         rewards (SOL)    │
  │                                                     │
  │        ↑                              ↓             │
  │                                                     │
  │   THINK           SPEND            CONVERT          │
  │   Plan next  ←    API credits ←    SOL → USDC      │
  │   launch          via Skyfire      via Jupiter      │
  │                                                     │
  │        ↑                              ↓             │
  │                                                     │
  │   USE              ←     DEPOSIT     ←              │
  │   LLM reasoning          USDC into Skyfire          │
  │                                                     │
  └─────────────────────────────────────────────────────┘
```

## Prerequisites

- **Skyfire account** — Sign up at [app.skyfire.xyz](https://app.skyfire.xyz) and get a buyer agent API key
- **Helius API key** — Free tier at [helius.dev](https://helius.dev)
- **Solana wallet** — A fresh keypair for the agent (Base58 private key)
- **Anthropic API key** — For initial bootstrap before the agent is self-funding

## Quick Start (Railway)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https://github.com/kaelxsol/infinite-protocol&envs=OPENCLAW_GATEWAY_TOKEN,SKYFIRE_API_KEY,SOLANA_PRIVATE_KEY,HELIUS_API_KEY,ANTHROPIC_API_KEY)

1. Click the deploy button above
2. Set the required environment variables:
   - `OPENCLAW_GATEWAY_TOKEN` — Pick any strong token for gateway auth
   - `SKYFIRE_API_KEY` — From your Skyfire dashboard
   - `SOLANA_PRIVATE_KEY` — Base58 private key for the agent wallet
   - `HELIUS_API_KEY` — From Helius dashboard
   - `ANTHROPIC_API_KEY` — From Anthropic console
3. Railway provisions the container and starts the OpenClaw gateway
4. Access the setup wizard at your Railway URL on port 18789
5. Fund the agent wallet with initial SOL (0.5 SOL recommended)
6. Fund Skyfire with initial USDC ($10 recommended)
7. The agent takes over from here — it will begin scanning trends and launching

## Quick Start (Local)

```bash
cd agent

# Configure environment
cp .env.example .env
# Fill in all required keys in .env

# Run with Docker Compose
docker compose -f railway/docker-compose.yml up --build
```

The gateway will be available at `http://localhost:18789`.

## Skills Reference

| Skill | Purpose | Cron |
|-------|---------|------|
| **wallet-monitor** | Tracks SOL balance and incoming creator rewards via Helius RPC | Every 15 min |
| **jupiter-swap** | Converts excess SOL to USDC via Jupiter V6 aggregator | Triggered by wallet-monitor |
| **skyfire-fund** | Deposits USDC into Skyfire wallet for API credit purchasing | Triggered by check-revenue |
| **pump-deployer** | Deploys tokens on pump.fun with auto-generated metadata | Every 4 hours |
| **trend-scanner** | Scans HN, Reddit, Google Trends for token-worthy narratives | Every 2 hours |

## Safety Controls

| Parameter | Default | Description |
|-----------|---------|-------------|
| `MAX_SOL_PER_SWAP` | 5 | Maximum SOL per Jupiter swap |
| `MAX_DAILY_SKYFIRE_DEPOSIT` | $50 | Maximum USDC deposited to Skyfire per day |
| `MIN_WALLET_RESERVE` | 0.1 SOL | Never swap below this balance |
| `SOL_SWAP_THRESHOLD` | 0.5 SOL | Only trigger swap above this balance |
| `DEPLOY_COOLDOWN_MINUTES` | 30 | Minimum minutes between token deploys |
| Launch blackout | 02:00-06:00 UTC | No deploys during low-activity hours |
| Concept queue max | 3 | Maximum prepared concepts stored |
| Concept expiry | 24 hours | Stale concepts are auto-removed |

## Monitoring

The agent reports status via the daily health check cron (8:00 AM UTC). Metrics include:

- Wallet SOL balance
- Skyfire USDC balance
- API credits remaining
- Tokens launched (total count)
- Total revenue earned
- Net P&L

OpenClaw supports Telegram, Discord, and Slack integrations for receiving these reports. Configure in the gateway setup wizard.

## Cost Breakdown

**Startup costs:**
- Agent wallet funding: 0.5 SOL (~$75 at $150/SOL)
- Skyfire initial deposit: $10 USDC
- **Total: ~$85**

**Per-launch costs:**
- Token deploy: ~0.02 SOL
- Initial dev buy: ~0.05 SOL
- Tx fees: ~0.01 SOL
- **Total per launch: ~0.08 SOL (~$12)**

**Break-even:**
- pump.fun creator fee: 0.95% of trading volume
- At $1,000 volume on a single token → ~$9.50 in fees
- At $2,000 volume → ~$19 in fees (covers launch cost + API credits)
- One modestly viral launch can fund weeks of operation

## File Structure

```
agent/
├── README.md                  ← You are here
├── openclaw.json              ← Agent config, MCP servers, cron jobs
├── index.js                   ← Treasury agent daemon (legacy)
├── package.json               ← Treasury agent deps (legacy)
├── .env.example               ← All environment variables
├── skills/
│   ├── wallet-monitor/SKILL.md
│   ├── jupiter-swap/SKILL.md
│   ├── skyfire-fund/SKILL.md
│   ├── pump-deployer/SKILL.md
│   └── trend-scanner/SKILL.md
└── railway/
    ├── railway.toml           ← Railway deployment config
    ├── Dockerfile             ← Container build
    └── docker-compose.yml     ← Local development
```
