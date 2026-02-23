# INFINITE Launch Stream — Build Plan

## Stream Order

1. Live Trade Feed (launch hype)
2. Multi-Model Battle UI (unique feature showcase)
3. Public Demo Chat (onboard viewers)
4. Quick wins between segments

---

## 1. Live Token Trade Feed

**What:** Real-time ticker showing buys/sells on $INFINITE as they happen. Viewers see the action live.

**Time:** ~30-40 min

**Where:** New component in `dashboard/` or a standalone widget on `site/`

### Architecture

```
PumpPortal WSS ──→ Browser WebSocket ──→ DOM Feed
wss://pumpportal.fun/api/data
```

### Build Steps

1. **Create `dashboard/js/tradefeed.js`**

```javascript
const INFINITE_MINT = 'DhsN1JmBZCvcL9P7cK1R9NLy5VB1kQcecUG7JbKQpump';

function initTradeFeed() {
  const ws = new WebSocket('wss://pumpportal.fun/api/data');
  const feed = document.getElementById('trade-feed');

  ws.onopen = () => {
    ws.send(JSON.stringify({
      method: 'subscribeTokenTrade',
      keys: [INFINITE_MINT]
    }));
  };

  ws.onmessage = (event) => {
    const trade = JSON.parse(event.data);
    const row = document.createElement('div');
    row.className = `trade-row ${trade.txType}`;

    const solAmount = (trade.solAmount / 1e9).toFixed(4);
    const tokenAmount = Number(trade.tokenAmount).toLocaleString();
    const shortWallet = trade.traderPublicKey.slice(0, 4) + '...' + trade.traderPublicKey.slice(-4);
    const time = new Date().toLocaleTimeString();

    row.innerHTML = `
      <span class="trade-type">${trade.txType === 'buy' ? '▲ BUY' : '▼ SELL'}</span>
      <span class="trade-amount">${solAmount} SOL</span>
      <span class="trade-tokens">${tokenAmount} INFINITE</span>
      <span class="trade-wallet">${shortWallet}</span>
      <span class="trade-time">${time}</span>
    `;

    feed.prepend(row);

    // Keep feed at 50 items max
    while (feed.children.length > 50) {
      feed.removeChild(feed.lastChild);
    }
  };

  ws.onclose = () => setTimeout(initTradeFeed, 3000); // auto-reconnect
}
```

2. **Add HTML container to dashboard**

```html
<div id="trade-feed-panel">
  <h3>Live Trades</h3>
  <div id="trade-feed"></div>
</div>
```

3. **Style it**

```css
@layer base {
  .trade-row {
    display: flex;
    gap: 1rem;
    padding: 0.5rem 1rem;
    font-family: monospace;
    font-size: 0.85rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    animation: slideIn 0.3s ease-out;
  }
  .trade-row.buy { color: #22c55e; }
  .trade-row.sell { color: #ef4444; }

  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }
}
```

### Enhancements to add live

- **Running totals** — net buy/sell pressure bar
- **Sound effects** — `new Audio('cha-ching.mp3').play()` on buys
- **Whale alerts** — flash/highlight trades above X SOL
- **Confetti** on large buys (use canvas-confetti, 3kb CDN)

---

## 2. Multi-Model Battle UI

**What:** Send one prompt to Claude, Gemini, OpenAI, GPT-4o simultaneously. Show responses racing in side-by-side. Viewers vote on best answer.

**Time:** ~30 min

**Where:** New tab in `dashboard/`

### Architecture

```
User prompt ──→ POST /v1/multi/stream ──→ 4 SSE streams ──→ 4 panels updating live
```

### Build Steps

1. **Create `dashboard/js/battle.js`**

```javascript
async function startBattle(prompt) {
  const models = ['claude-sonnet-4-5-20250929', 'gemini-2.5-flash', 'gpt-4o', 'gemini-2.5-pro'];
  const panels = models.map(m => document.getElementById(`panel-${m}`));

  // Clear panels
  panels.forEach(p => { p.textContent = ''; p.dataset.done = 'false'; });

  const response = await fetch('/v1/multi/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      models,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

    for (const line of lines) {
      const data = JSON.parse(line.slice(6));
      const panel = document.getElementById(`panel-${data.model}`);
      if (panel) {
        panel.textContent += data.content || '';
        if (data.done) panel.dataset.done = 'true';
      }
    }
  }
}
```

2. **HTML layout — 4 panels grid**

```html
<div id="battle-arena">
  <div class="battle-input">
    <input type="text" id="battle-prompt" placeholder="Ask all models..." />
    <button onclick="startBattle(document.getElementById('battle-prompt').value)">
      Battle
    </button>
  </div>
  <div class="battle-grid">
    <div class="model-panel">
      <div class="model-header">Claude Sonnet</div>
      <div class="model-output" id="panel-claude-sonnet-4-5-20250929"></div>
    </div>
    <div class="model-panel">
      <div class="model-header">Gemini Flash</div>
      <div class="model-output" id="panel-gemini-2.5-flash"></div>
    </div>
    <div class="model-panel">
      <div class="model-header">GPT-4o</div>
      <div class="model-output" id="panel-gpt-4o"></div>
    </div>
    <div class="model-panel">
      <div class="model-header">Gemini Pro</div>
      <div class="model-output" id="panel-gemini-2.5-pro"></div>
    </div>
  </div>
</div>
```

3. **CSS — responsive 2x2 grid**

```css
.battle-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  height: 60vh;
}

.model-panel {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.model-header {
  padding: 0.5rem 1rem;
  font-weight: 600;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  position: sticky;
  top: 0;
}

.model-output {
  padding: 1rem;
  white-space: pre-wrap;
  font-size: 0.9rem;
  flex: 1;
}

.model-output[data-done="true"] {
  border-color: #22c55e;
}
```

### Enhancements to add live

- **Timer** per model — show response speed
- **Vote buttons** — "Which answer is best?" with results bar
- **Token count** display per response
- **Typing indicator** animation while streaming

---

## 3. Public Demo Chat (Free Trial)

**What:** A public page where non-holders can try 3 free messages. Funnel to buy $INFINITE for unlimited access.

**Time:** ~20-30 min

**Where:** `site/demo.html` or `site/try.html`

### Architecture

```
Visitor ──→ demo page ──→ API proxy (IP-based rate limit, 3 msgs) ──→ Claude response
```

### Build Steps

1. **Add rate-limit route in `api-proxy/routes/`**

```javascript
// New middleware for demo endpoint
const demoLimits = new Map(); // IP -> count

function demoRateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.ip;
  const count = demoLimits.get(ip) || 0;

  if (count >= 3) {
    return res.status(429).json({
      error: 'Demo limit reached',
      message: 'Buy $INFINITE for unlimited access',
      link: 'https://pump.fun/coin/DhsN1JmBZCvcL9P7cK1R9NLy5VB1kQcecUG7JbKQpump'
    });
  }

  demoLimits.set(ip, count + 1);
  next();
}

router.post('/v1/demo/chat', demoRateLimit, async (req, res) => {
  // Proxy to Claude Sonnet with a fixed system prompt
  // Use existing chat logic but with demo constraints
  // Max 500 tokens per response
});
```

2. **Create `site/try.html`**

Minimal chat UI — input box, message history, CTA banner at top linking to pump.fun.

After 3 messages, overlay a modal:

```
"You've used your 3 free messages.
Hold $INFINITE for unlimited access to Claude, Gemini, GPT-4o, image gen, trading tools, and autonomous agents.

[Buy on pump.fun] [View Dashboard]"
```

3. **Link from landing page** — Add "Try Free" button on `site/index.html`

---

## 4. Quick Wins (10-15 min each)

### A. Whale Alert Overlay

When a trade over 1 SOL hits the feed, render a full-screen flash:

```javascript
if (solAmount > 1) {
  const overlay = document.createElement('div');
  overlay.className = 'whale-alert';
  overlay.textContent = `WHALE BUY: ${solAmount} SOL`;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 3000);
}
```

### B. Holder Count Badge

Fetch holder count from Helius DAS API, display on site:

```javascript
async function getHolderCount() {
  const resp = await fetch('HELIUS_RPC_URL', {
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTokenAccounts',
      params: { mint: INFINITE_MINT, limit: 1, page: 1 }
    })
  });
  const data = await resp.json();
  return data.result.total;
}
```

### C. Treasury Health Widget

Public-facing widget showing:
- Treasury SOL balance
- API calls served today
- Estimated runway
- "Self-sustaining" status indicator

Pull from your `/admin/treasury` endpoint (make a public subset).

### D. Sound Effects

```javascript
const sounds = {
  buy: new Audio('https://cdn.example.com/coin.mp3'),
  sell: new Audio('https://cdn.example.com/drop.mp3'),
  whale: new Audio('https://cdn.example.com/whale.mp3')
};

// In trade feed handler:
sounds[trade.txType]?.play();
if (solAmount > 1) sounds.whale.play();
```

### E. Animated Token Price Ticker

CSS-only scrolling ticker at top of page showing price from trade events:

```javascript
let lastPrice = 0;
// Calculate from trade data:
// price = solAmount / tokenAmount
```

---

## Stream Flow (Suggested Timeline)

| Time | Segment | Notes |
|------|---------|-------|
| 0:00 | Intro + token launch | Show pump.fun, explain the project |
| 0:10 | **Build #1: Live Trade Feed** | Code it live as trades roll in |
| 0:40 | Add whale alerts + sounds | Quick enhancement, crowd-pleaser |
| 0:50 | **Build #2: Multi-Model Battle** | Showcase unique multi-model feature |
| 1:20 | Live demo — battle prompts from chat | Interactive segment, take suggestions |
| 1:35 | **Build #3: Public Demo Page** | "Let viewers try it" moment |
| 1:55 | Quick wins + polish | Theme tweaks, animations, badges |
| 2:10 | Architecture walkthrough | Explain treasury loop, show agent code |
| 2:25 | Q&A + viewer requests | Code small features chat suggests |
| 2:45 | Wrap up + CTA | Link to token, dashboard, docs |

---

## Pre-Stream Checklist

- [ ] Token mint address ready, update in all configs
- [ ] API proxy deployed and running on Railway
- [ ] Redis (Upstash) provisioned with env vars set
- [ ] All 3 LLM API keys active (Anthropic, Google, OpenAI)
- [ ] Helius RPC endpoint configured
- [ ] Dashboard deployed on Vercel
- [ ] Treasury wallet funded with initial SOL
- [ ] OBS/streaming software configured
- [ ] VS Code open with relevant files
- [ ] Browser tabs: pump.fun, dashboard, solscan, site
