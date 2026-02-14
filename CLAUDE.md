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
- The dashboard is wired to real Solana wallet adapters (Phantom, Backpack, Solflare) and connects to the API proxy via `/proxy` Vercel rewrite. Session persists in localStorage.
- Balance cache TTL is 5 minutes. Treasury agent checks balance every 5 minutes, SOL price every 15 minutes.
- Admin auth for treasury agent push uses `ADMIN_KEY` env var (defaults to `dev-admin-key`).
- The treasury agent health status determines rate limit multiplier: surplus (1.5x), healthy (1.0x), cautious (0.7x), critical (0.3x).
- `vercel.json` handles routing rewrites. Vercel org ID is in `.vercel/project.json`.

## Frontend Design System

All pages **must** import the shared design system. Every new HTML page needs this in `<head>`:

```html
<link rel="icon" type="image/png" href="/site/favicon.png">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=JetBrains+Mono:wght@300;400;500;700&family=Sora:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/site/shared.css">
```

**`site/shared.css`** is the single source of truth for:
- CSS reset, variables/tokens (`--bg`, `--surface`, `--border`, `--text`, `--accent`, etc.)
- Base `html`/`body` styles, `::selection`
- Typography utilities (`.heading-xl/lg/md/sm`, `.label-sm`, `.mono`, `.accent`, `.dim`, `.muted`)
- Nav (`.nav`, `.nav-logo`, `.nav-links`, `.nav-cta`)
- Buttons (`.btn-primary`, `.btn-secondary`, `.btn-sm` with `.primary`/`.danger` variants)
- Cards (`.card`, `.card.interactive`)
- Section labels (`.section-label` with accent line `::before`)
- Stats grid (`.stats-row`, `.stat-card` with `.stat-label`/`.stat-value`/`.stat-sub`)
- Tools grid (`.tools-grid`, `.tool-card` with status badges)
- Models list (`.models-list`, `.model-row` with live pulse dot)
- Code blocks (`.code-block` with `.comment`/`.string`/`.key` syntax colors)
- Footer (`.footer`, `.footer-links`)
- Animations (`@keyframes fadeUp`, `.reveal`/`.reveal.visible`)
- Responsive breakpoints (`@media max-width: 900px`)

**Key tokens:** accent `#c8ff00`, bg `#0a0a0a`, surface `#111111`. Fonts: DM Serif Display (headings), Sora (body), JetBrains Mono (code/UI).

**Rules for new pages:**
- Never redeclare `:root` variables, reset, or base styles — shared.css handles it.
- Use shared component classes where they fit. Only add page-specific `<style>` for unique layouts.
- Add any new reusable component to `shared.css`, not inline.
- When adding a new route, add the rewrite to `vercel.json`.

## Discord Integration

Use the Discord MCP to post updates to the INFINITE Discord server. Channel IDs:

- `#releases` — Major releases, deployments, breaking changes (ANNOUNCEMENTS category)
- `#updates` — `1471262900583792640` — Protocol updates, changelog
- `#announcements` — `1471263067374358568` — Official announcements
- `#treasury-updates` — `1471262921882468457` — Auto-posted by treasury agent webhook

**When to post to Discord:**
- On any major feature deployment or breaking change, post a formatted update to `#releases` using `discord_execute` with `messages.send`
- Format: use markdown with separator lines (`━━━━━━━━━━━━━━━━━━━━━━━━━━━`) and clear headings
- Keep the tone direct and professional — no hype, no emojis unless the user requests them
- Always mention what changed, why it matters, and any action holders need to take

**Treasury webhook** (`agent/index.js`): The treasury agent auto-posts hourly reports and health status change alerts to `#treasury-updates` via Discord webhook. No manual posting needed for treasury data.
