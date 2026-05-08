# Meterflow — Scaling & Infrastructure Upgrades

## Current Architecture

| Component | Host | Cost |
|---|---|---|
| Static site + dashboard | Vercel (Hobby) | $0 |
| API proxy | Railway | ~$2-5/mo usage-based |
| Treasury agent | Docker (containerized) | Depends on host |
| Discord bot | Standalone Node.js | Depends on host |
| Redis cache | Upstash | Free tier |
| Solana RPC | Helius | Free tier |

---

## 1. Hosting Decisions

### Vercel — Stay Free or Upgrade?

**Hobby tier limitations that matter:**
- 100 GB bandwidth/month (marketing site + dashboard combined)
- 1M edge requests/month
- 1 concurrent build
- 100 deployments/day
- **Non-commercial use only** — any revenue-generating project violates ToS

**Verdict: Move static assets OFF Vercel entirely.**

The Hobby plan's commercial restriction is a legal liability once revenue flows. Pro at $20/mo is overpriced for serving static files. The smarter move:

| Action | Platform | Cost |
|---|---|---|
| Move `site/` and `dashboard/` to **Cloudflare Pages** | Cloudflare | **$0** |
| Keep `vercel.json` proxy rewrites as a Cloudflare Worker | Cloudflare Workers | **$0-5/mo** |

**Why Cloudflare Pages wins:**
- **Unlimited bandwidth** — free tier, no caps
- **Unlimited requests** — no per-request billing
- **Global CDN** (330+ cities vs Vercel's smaller edge network)
- **Free DDoS protection** (Cloudflare's core product)
- **Free web analytics** — no cookies, unlimited events
- 500 builds/month free, 5,000 on paid ($5/mo)

**Cost at scale comparison (500 GB bandwidth/month):**

| Platform | Cost |
|---|---|
| Cloudflare Pages | $0 |
| Vercel Pro | $20+ |

At 2 TB/month: Cloudflare is still $0-5 vs Vercel at ~$170.

---

### Render vs Railway — Where to Run the API Proxy

#### Render Pricing (Key Tiers)

| Tier | CPU | RAM | Price |
|---|---|---|---|
| Free | 0.1 | 512 MB | $0 (sleeps after 15 min) |
| Starter | 0.5 | 512 MB | $7/mo |
| Standard | 1.0 | 2 GB | $25/mo |

**Render issues:**
- Free tier sleeps after 15 min, 30-60s cold start
- Slow builds (10-15 min reported)
- No scale-to-zero on paid tiers
- Limited to 5 regions
- Team seats: $19/user/mo (Pro), $29/user/mo (Org)

#### Railway Pricing

Usage-based billing: ~$0.000231/vCPU-min + $0.000231/GB-min

| Workload | Estimated Cost |
|---|---|
| Light Node.js API (~5% CPU avg) | $2-5/mo |
| Moderate traffic (~20% CPU avg) | $8-15/mo |
| Heavy traffic (50%+ CPU) | $20-40/mo |

**Railway advantages:**
- 30-90s deploys (vs 1-3 min Render)
- Scale to zero on all plans
- No build minute caps
- MySQL/MongoDB support if needed later
- $5/seat (Hobby) vs $19/seat (Render Pro)

**Railway disadvantages:**
- No native static site hosting
- No built-in cron jobs (recently added, limited)
- Variable billing makes costs less predictable

#### Recommendation

**Stay on Railway for the API proxy.** Usage-based billing is cheaper at current traffic levels. Deploy speed is faster. Scale-to-zero saves money during low-traffic periods.

**When to reconsider Render:**
- If traffic becomes steady and predictable (fixed $7/mo Starter may beat usage-based)
- If you need built-in cron jobs for the treasury agent

---

## 2. Scaling the Stack

### Priority Order of Upgrades

| Priority | Upgrade | Cost | Impact |
|---|---|---|---|
| **1** | Move static sites to Cloudflare Pages | $0 | Eliminates bandwidth costs + Vercel ToS risk |
| **2** | Add Sentry error tracking | $0 (free: 5K events/mo) | Catch errors before users report them |
| **3** | Add uptime monitoring (Better Stack) | $0 (free: 10 monitors) | Alerting on downtime |
| **4** | Redis pub/sub for WebSocket fan-out | $0 (Upstash free tier) | One upstream PumpPortal connection shared across clients |
| **5** | Cloudflare WAF rate limiting | $0 (basic) | Edge-level DDoS/abuse protection |
| **6** | Add persistent database (Turso or Neon) | $0 (free tier) | When you need relational data beyond Redis |
| **7** | Upgrade Railway compute | ~$8-15/mo | When API proxy needs more headroom |
| **8** | Helius paid RPC plan | $49-499/mo | When free tier rate limits become a bottleneck |

### Caching Strategy

```
Static assets (CSS/JS):  Cache-Control: max-age=31536000, immutable
HTML files:               Cache-Control: public, max-age=0, must-revalidate
API responses:            Redis TTL per endpoint (30s-5min depending on freshness needs)
Solana RPC calls:         Cache balance checks for 10-30s to avoid hammering Helius
```

### WebSocket Scaling

Current: Each dashboard client opens its own upstream connection to PumpPortal.

**Upgrade:** Single upstream PumpPortal WebSocket → Redis pub/sub → fan out to N dashboard clients. This prevents upstream rate limits and reduces external connection count.

Only needed when concurrent dashboard users exceed ~50-100.

### Database Options (When Needed)

| Option | Free Tier | Paid | Best For |
|---|---|---|---|
| **Turso** (libSQL) | 9 GB, 500M reads/mo | $29/mo | Relational data, edge-replicated |
| **Neon** (Postgres) | 0.5 GB, 190 compute hrs | $19/mo | Serverless Postgres, scales to zero |
| **Supabase** (Postgres) | 500 MB, 5 GB bandwidth | $25/mo | Postgres + auth + realtime |
| **Upstash Redis** | 256 MB, 500K cmds/mo | $0.20/100K cmds | Caching, rate limiting, sessions |

### Monitoring Stack

| Tool | Free Tier | Purpose |
|---|---|---|
| **Sentry** | 5K errors/month | Error tracking (already in deps) |
| **Better Stack** | 3 GB logs, 10 monitors | Uptime + log aggregation |
| **Cloudflare Analytics** | Unlimited | Traffic analytics |
| **Grafana Cloud** | 10K metrics, 50 GB logs | Full observability (if needed later) |

Skip Datadog ($23/host/mo minimum, escalates fast). Overkill for this stage.

---

## 3. OpenClaw Agents

### What It Is

**OpenClaw** (formerly Clawdbot/Moltbot) is a free, open-source AI agent framework by Peter Steinberger. 200K+ GitHub stars as of Feb 2026. Steinberger is joining OpenAI; project moving to an open-source foundation.

**Architecture:**
- Gateway (orchestration/routing)
- ReAct loop (reason → tool call → integrate)
- Tool layer (email, files, APIs, web scraping)
- Skills system (ClawHub marketplace — 3,000+ community skills)
- Memory system (persistent context across sessions)
- Scheduling (proactive recurring tasks)

**Connects to:** WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Teams

**LLM support:** Claude, GPT, DeepSeek, Gemini, Llama

### Current Usage in Meterflow

The treasury agent already uses **OpenClaw 2026.2.0** (`agent/openclaw.json`) with skills:
- `wallet-monitor` — track SOL balance via Helius
- `trend-scanner` — Google Trends, Reddit, HN scraping
- `jupiter-swap` — token swaps for fund management
- `pump-deployer` — automated token creation
- `skyfire-fund` — deposit USDC to Skyfire

### Costs

| Option | Price |
|---|---|
| Self-hosted | $0 (+ LLM API costs: $5-30/mo typical) |
| OpenClaw Cloud (managed) | $39.90/mo base, $89.90/mo with $60 LLM credits |

### Crypto Warning

OpenClaw's Discord has **banned all crypto discussion** after scammers launched a fake token under its name ($16M market cap) and security researchers found malicious skills targeting crypto traders. The project has no official token.

---

## 4. Automating API Purchasing

### The Problem

Meterflow needs to pay for: Anthropic API, OpenAI API, Google Gemini API, Helius RPC, hosting (Railway/Cloudflare), and potentially more services. Revenue comes in as SOL from pump.fun creator fees. Need a system to convert revenue → pay for operational APIs.

### Best Solutions (Ranked by Practicality)

#### Option A: Privacy.com Virtual Cards (Simplest)

**How it works:** Programmatically issue merchant-locked virtual cards via their API. Each card is locked to one vendor (e.g., one card for Anthropic, one for OpenAI, one for Railway).

| Feature | Detail |
|---|---|
| Merchant locking | Card only works at specified vendor |
| Spending limits | Daily/monthly/annual caps per card |
| Single-use cards | Auto-close after one transaction |
| Instant pause/close | Kill a card via API call |
| OpenClaw integration | Official guide exists |

**Flow:** Treasury agent swaps SOL → USDC → fiat off-ramp → fund Privacy.com balance → auto-pay API bills

**Best for:** Traditional API vendors that only accept credit cards (Anthropic, OpenAI, Google, AWS, etc.)

#### Option B: x402 Protocol on Solana (Most Native)

**What it is:** HTTP 402 payment protocol. Agent calls an API → gets 402 response with payment details → attaches USDC payment → retries → access granted. Pay-per-request, no accounts or API keys needed.

| Feature | Detail |
|---|---|
| Transaction cost | ~$0.00025 per Solana tx |
| Finality | 400ms |
| Market share | 50-80% of all x402 transactions are on Solana |
| SDK support | Python + Node.js SDKs available |
| Stripe support | Stripe launched x402 on Base (Feb 2026) |

**Limitation:** Only works if the API vendor supports x402. Most traditional vendors (Anthropic, OpenAI) don't yet. Best for crypto-native services and future-proofing.

#### Option C: Coinbase Agentic Wallets (Most Robust for On-Chain)

Launched Feb 11, 2026 — wallet infrastructure built for AI agents.

| Feature | Detail |
|---|---|
| Capabilities | Hold funds, send payments, trade tokens, earn yield |
| Protocol | x402-native, 50M+ transactions processed |
| Security | Non-custodial, keys in Coinbase secure enclaves |
| Guardrails | Session caps, per-tx limits, compliance screening |
| Dashboard | Agent management + monitoring UI |

**Best for:** On-chain operations, agent-to-agent payments, x402 ecosystems.

#### Option D: Stripe Billing (Traditional Fallback)

Standard subscription management. Handles creation, renewal, cancellation, webhooks. Overkill if you're just paying for APIs, but useful if Meterflow ever sells API access via traditional billing.

### Recommended Architecture

```
┌─────────────────┐
│  pump.fun fees   │  (SOL inflow)
└────────┬────────┘
         │
    ┌────▼────┐
    │ Treasury │  OpenClaw agent (existing)
    │  Agent   │  - monitors wallet (wallet-monitor skill)
    │          │  - swaps SOL → USDC (jupiter-swap skill)
    └────┬────┘
         │
    ┌────▼──────────────────────────┐
    │       Payment Rails           │
    │                               │
    │  ┌──────────────────────┐     │
    │  │ Privacy.com API      │     │  Fiat vendors:
    │  │ (virtual cards)      │────►│  Anthropic, OpenAI, Google,
    │  └──────────────────────┘     │  Railway, Helius, etc.
    │                               │
    │  ┌──────────────────────┐     │
    │  │ x402 / Coinbase      │     │  Crypto-native vendors:
    │  │ Agentic Wallet       │────►│  Future x402-enabled APIs,
    │  └──────────────────────┘     │  on-chain services
    │                               │
    └───────────────────────────────┘
```

**Step-by-step implementation:**

1. **Treasury agent already handles** SOL monitoring + Jupiter swaps (existing skills)
2. **Add fiat off-ramp:** Use Bridge.xyz (Stripe-backed) to convert USDC → USD
3. **Add Privacy.com skill:** New OpenClaw skill that creates/funds virtual cards per vendor
4. **Set spending limits:** Each card capped at expected monthly API cost + 20% buffer
5. **Add x402 skill:** For any vendor that supports it (future-proof)
6. **Health check reporting:** Extend existing daily health check to include API budget runway

### Cost of Automation

| Component | Cost |
|---|---|
| OpenClaw (self-hosted) | $0 |
| LLM API for agent reasoning | $5-15/mo |
| Bridge.xyz off-ramp fees | ~1-2% per conversion |
| Privacy.com | Free (personal) or $10/mo (commercial) |
| Coinbase Agentic Wallet | Free (transaction fees only) |

---

## 5. Budget Projections

### Minimal Scale (Current)

| Service | Monthly Cost |
|---|---|
| Cloudflare Pages (static sites) | $0 |
| Railway (API proxy) | $2-5 |
| Upstash Redis (free tier) | $0 |
| Helius RPC (free tier) | $0 |
| Sentry (free tier) | $0 |
| Better Stack (free tier) | $0 |
| OpenClaw agent (self-hosted) | $0 |
| LLM APIs (agent reasoning) | $5-15 |
| **Total** | **$7-20/mo** |

### Growth Stage (~1K daily active users)

| Service | Monthly Cost |
|---|---|
| Cloudflare Pages | $0-5 |
| Railway (higher compute) | $15-25 |
| Upstash Redis (paid) | $10 |
| Helius RPC (Startup) | $49 |
| Sentry (free still sufficient) | $0 |
| Privacy.com (API payments) | $10 |
| LLM APIs (user-facing + agent) | $100-500 |
| **Total** | **$184-599/mo** |

### Scale Stage (~10K daily active users)

| Service | Monthly Cost |
|---|---|
| Cloudflare Pages + Workers | $5 |
| Railway (multiple services) | $50-100 |
| Upstash Redis (standard) | $32 |
| Helius RPC (Business) | $199-499 |
| Sentry (paid) | $26 |
| Grafana Cloud | $19 |
| Privacy.com + Bridge.xyz fees | $20-50 |
| LLM APIs (user-facing + agent) | $1,000-5,000 |
| **Total** | **$1,351-5,731/mo** |

> LLM API costs dominate at scale. The self-sustaining model (creator fees → API budget) needs to generate enough SOL to cover these costs. The treasury agent's health check should track API runway daily.

---

## TL;DR — Immediate Action Items

1. **Move site/ and dashboard/ to Cloudflare Pages** — $0, eliminates Vercel ToS risk + bandwidth caps
2. **Stay on Railway** for API proxy — cheaper than Render at current traffic
3. **Add Sentry + Better Stack** — free tiers, catch errors and downtime
4. **Build a Privacy.com OpenClaw skill** — automate fiat API payments with merchant-locked virtual cards
5. **Add Bridge.xyz integration** to treasury agent — USDC → fiat off-ramp for paying vendors
6. **Monitor API runway** in the existing daily health check cron job
