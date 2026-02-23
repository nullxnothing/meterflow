// ═══════════ MOBILE MENU ═══════════
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('active');
  mobileMenu.classList.toggle('open');
});

function closeMobile() {
  hamburger.classList.remove('active');
  mobileMenu.classList.remove('open');
}

// ═══════════ TOKEN CONFIG ═══════════
const TOKEN_MINT = '';

// ═══════════ LIVE DATA ═══════════
const PROXY_BASE = '/proxy';
let liveStats = { totalCallsToday: 0, activeKeys: 0 };
let liveTreasury = { runwayDays: 0, treasuryBalanceUsd: 0 };
let fetchFailed = false;

async function fetchLiveData() {
  try {
    const [statsRes, treasuryRes] = await Promise.allSettled([
      fetch(`${PROXY_BASE}/stats`).then(r => r.json()),
      fetch(`${PROXY_BASE}/treasury`).then(r => r.json()),
    ]);
    if (statsRes.status === 'fulfilled') liveStats = statsRes.value;
    if (treasuryRes.status === 'fulfilled') liveTreasury = treasuryRes.value;
    fetchFailed = (statsRes.status !== 'fulfilled' && treasuryRes.status !== 'fulfilled');
  } catch (err) {
    console.warn('[INFINITE] Failed to fetch live data:', err);
    fetchFailed = true;
  }
}

function formatCompact(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function populateProtocolStats() {
  const el = (id) => document.getElementById(id);

  const callsToday = liveStats.totalCallsToday || 0;
  const tokensToday = liveStats.totalTokensToday || 0;
  const keys = liveStats.totalKeysIssued || 0;

  const balSol = liveTreasury.treasuryBalanceSol || 0;
  const balUsd = liveTreasury.treasuryBalanceUsd || 0;
  const runway = liveTreasury.runwayDays || 0;
  const health = liveTreasury.healthStatus || 'unknown';

  el('ps-calls-today').textContent = formatCompact(callsToday);
  el('ps-tokens-today').textContent = tokensToday > 0 ? formatCompact(tokensToday) + ' tokens' : 'tokens processed';
  el('ps-active-keys').textContent = formatCompact(keys);
  el('ps-treasury').textContent = balSol > 0 ? balSol.toFixed(2) + ' SOL' : '--';
  el('ps-treasury-usd').textContent = balUsd > 0 ? '$' + formatCompact(Math.round(balUsd)) : (fetchFailed ? 'offline' : 'loading...');
  el('ps-runway').textContent = runway > 0 ? runway + 'd' : (runway === Infinity || liveTreasury.runwayDays === '\u221E' ? '\u221E' : '--');
  el('ps-health').textContent = health !== 'unknown' ? health : (fetchFailed ? 'offline' : 'loading...');
}

// ═══════════ FAQ ═══════════
function toggleFaq(btn) {
  const item = btn.parentElement;
  const answer = item.querySelector('.faq-answer');
  const isOpen = item.classList.contains('active');

  document.querySelectorAll('.faq-item').forEach(el => {
    el.classList.remove('active');
    el.querySelector('.faq-answer').classList.remove('open');
  });

  if (!isOpen) {
    item.classList.add('active');
    answer.classList.add('open');
  }
}

// ═══════════ COPY CA ═══════════
function copyCA() {
  const address = document.getElementById('caAddress').textContent;
  if (address.includes('imminent') || address.includes('TBD')) return;
  navigator.clipboard.writeText(address).then(() => {
    const btn = document.getElementById('caCopy');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
}

// ═══════════ TOKEN CA ═══════════
function populateToken() {
  const mint = TOKEN_MINT || liveStats.tokenMint;
  if (!mint) {
    const heroCa = document.querySelector('.hero-ca');
    if (heroCa) heroCa.classList.add('pending');
    return;
  }

  const heroCa = document.querySelector('.hero-ca');
  if (heroCa) heroCa.classList.remove('pending');

  const caEl = document.getElementById('caAddress');
  const buyLink = document.getElementById('buyLink');
  const ctaBuyLink = document.getElementById('ctaBuyLink');
  const footerDex = document.getElementById('footerDex');
  const treasuryLink = document.getElementById('treasurySolscan');

  if (caEl) caEl.textContent = mint;

  if (buyLink) {
    buyLink.href = `https://pump.fun/coin/${mint}`;
    buyLink.target = '_blank';
    buyLink.rel = 'noopener';
  }

  if (ctaBuyLink) {
    ctaBuyLink.href = `https://pump.fun/coin/${mint}`;
    ctaBuyLink.target = '_blank';
    ctaBuyLink.rel = 'noopener';
    ctaBuyLink.classList.remove('disabled');
  }

  if (footerDex) {
    footerDex.href = `https://dexscreener.com/solana/${mint}`;
  }

  if (treasuryLink && liveTreasury.wallet) {
    treasuryLink.href = `https://solscan.io/account/${liveTreasury.wallet}`;
  }

  document.querySelectorAll('.tier-btn').forEach(btn => {
    btn.onclick = () => window.open(`https://pump.fun/coin/${mint}`, '_blank');
  });
}

// ═══════════ INIT ═══════════
fetchLiveData().then(() => {
  populateToken();
  populateProtocolStats();
});

setTimeout(() => {
  if (!liveStats.totalCallsToday && !liveTreasury.treasuryBalanceSol) {
    fetchFailed = true;
    populateProtocolStats();
  }
}, 10_000);

setInterval(async () => {
  await fetchLiveData();
  populateProtocolStats();
}, 30_000);

// ═══════════ PARALLAX ═══════════
let rafScrollId = null;
window.addEventListener('scroll', () => {
  if (rafScrollId) return;
  rafScrollId = requestAnimationFrame(() => {
    const scroll = window.scrollY;
    const glow = document.querySelector('.hero-glow');
    if (glow) glow.style.transform = `translate(0, ${scroll * 0.3}px)`;
    rafScrollId = null;
  });
});

// ═══════════ SCROLL REVEAL ═══════════
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -60px 0px' });

document.querySelectorAll('.protocol-stats, .how-section, .tools-section, .tiers-section, .funded-section, .faq-section, .cta-section, .demo-section').forEach(el => {
  el.classList.add('scroll-reveal');
  revealObserver.observe(el);
});

// ═══════════ NAV SCROLL SPY ═══════════
const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
const spySections = document.querySelectorAll('section[id], .protocol-stats[id]');

const spyObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.id;
      navLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
      });
    }
  });
}, { threshold: 0.2, rootMargin: '-80px 0px -40% 0px' });

spySections.forEach(s => spyObserver.observe(s));

// ═══════════ CARD MOUSE GLOW ═══════════
document.querySelectorAll('.tool-card, .how-step, .tier-card, .funded-step, .stat-block').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  });
  card.addEventListener('mouseleave', () => {
    card.style.setProperty('--mouse-x', '50%');
    card.style.setProperty('--mouse-y', '50%');
  });
});

// ═══════════ BACKGROUND PARTICLES ═══════════
const bgCanvas = document.getElementById('bgCanvas');
if (bgCanvas && window.innerWidth > 768) {
  const ctx = bgCanvas.getContext('2d');
  const particles = [];
  const isTablet = window.innerWidth <= 1024;
  const PARTICLE_COUNT = isTablet ? 20 : 50;

  function resizeBg() {
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
  }

  function initParticles() {
    particles.length = 0;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * bgCanvas.width,
        y: Math.random() * bgCanvas.height,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        r: Math.random() * 1.5 + 0.5,
        a: Math.random() * 0.15 + 0.03,
      });
    }
  }

  function drawParticles() {
    ctx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x += bgCanvas.width;
      if (p.x > bgCanvas.width) p.x -= bgCanvas.width;
      if (p.y < 0) p.y += bgCanvas.height;
      if (p.y > bgCanvas.height) p.y -= bgCanvas.height;
      ctx.fillStyle = `rgba(200, 255, 0, ${p.a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    if (!isTablet) {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = dx * dx + dy * dy;
          if (dist < 22500) {
            ctx.strokeStyle = `rgba(200, 255, 0, ${0.02 * (1 - dist / 22500)})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
    }
    requestAnimationFrame(drawParticles);
  }

  resizeBg();
  initParticles();
  drawParticles();
  window.addEventListener('resize', () => { resizeBg(); initParticles(); });
}

// ═══════════ LIVE DEMO ═══════════
const DEMO_DATA = [
  {
    prompt: 'Explain DeFi yield farming',
    claude: `Yield farming is the practice of depositing crypto assets into DeFi protocols to earn returns. Here's how it works:\n\n1. **Liquidity Provision** \u2014 You deposit token pairs (e.g., SOL/USDC) into an AMM like Raydium or Orca. Traders pay fees on every swap, and you earn a proportional share.\n\n2. **Lending** \u2014 Platforms like MarginFi let you lend assets. Borrowers pay interest, which flows to lenders as yield.\n\n3. **Incentive Mining** \u2014 Protocols distribute their native tokens as rewards for providing liquidity. This is often the highest-APY component.\n\n**Key risks:** Impermanent loss, smart contract exploits, and token devaluation can erode yields. Always check TVL trends and audit history before committing capital.`,
    gemini: `DeFi yield farming is essentially putting your crypto to work to earn more crypto. Think of it like interest from a bank, but decentralized:\n\n\u2022 **Step 1:** Choose a protocol (Raydium, Jupiter, Orca)\n\u2022 **Step 2:** Deposit your tokens into a liquidity pool\n\u2022 **Step 3:** Earn fees + token rewards automatically\n\nThe APY you see comes from three sources:\n- Swap fees (0.25-1% per trade)\n- Protocol incentives (bonus tokens)\n- Compounding rewards\n\nPopular strategies on Solana right now include concentrated liquidity on Orca and leveraged lending on MarginFi. Just watch out for impermanent loss \u2014 it's the silent killer of yield farming returns.`
  },
  {
    prompt: 'Write a Solana swap function',
    claude: `\`\`\`typescript\nimport { Connection, PublicKey } from '@solana/web3.js';\nimport { Jupiter } from '@jup-ag/core';\n\nasync function swap(\n  inputMint: string,\n  outputMint: string,\n  amountLamports: number,\n  slippageBps: number = 50\n) {\n  const connection = new Connection(\n    process.env.RPC_URL\n  );\n  const jupiter = await Jupiter.load({\n    connection,\n    cluster: 'mainnet-beta',\n  });\n\n  const routes = await jupiter.computeRoutes({\n    inputMint: new PublicKey(inputMint),\n    outputMint: new PublicKey(outputMint),\n    amount: amountLamports,\n    slippageBps,\n  });\n\n  const bestRoute = routes.routesInfos[0];\n  const { execute } = await jupiter.exchange({\n    routeInfo: bestRoute,\n  });\n\n  const result = await execute();\n  return result.txid;\n}\n\`\`\`\n\nThis uses Jupiter's aggregator for best pricing across all Solana DEXs. Set slippageBps to 50 (0.5%) for most trades.`,
    gemini: `Here's a clean swap implementation using Jupiter API v6:\n\n\`\`\`javascript\nasync function swapTokens(inputMint, outputMint, amount) {\n  // Get quote\n  const quoteUrl = 'https://quote-api.jup.ag/v6/quote'\n    + \`?inputMint=\${inputMint}\`\n    + \`&outputMint=\${outputMint}\`\n    + \`&amount=\${amount}\`\n    + '&slippageBps=50';\n\n  const quote = await fetch(quoteUrl)\n    .then(r => r.json());\n\n  // Build transaction\n  const { swapTransaction } = await fetch(\n    'https://quote-api.jup.ag/v6/swap',\n    {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify({\n        quoteResponse: quote,\n        userPublicKey: wallet.publicKey,\n      })\n    }\n  ).then(r => r.json());\n\n  // Sign and send\n  const tx = VersionedTransaction.deserialize(\n    Buffer.from(swapTransaction, 'base64')\n  );\n  tx.sign([wallet]);\n  return await connection.sendTransaction(tx);\n}\n\`\`\`\n\nThe v6 API handles route optimization automatically. No need to manually compare DEXs.`
  },
  {
    prompt: 'Analyze BTC market sentiment',
    claude: `**BTC Sentiment Analysis \u2014 Current Snapshot**\n\nOn-chain signals are mixed but leaning bullish:\n\n\uD83D\uDCCA **Exchange Flows:** Net outflows of ~12K BTC this week. Holders are moving to cold storage \u2014 typically accumulation behavior.\n\n\uD83D\uDCC8 **Funding Rates:** Slightly positive (0.01%) across major perps. Not overheated \u2014 room for a move up.\n\n\uD83D\uDC0B **Whale Activity:** Wallets holding >1K BTC have added 28K BTC in the past 30 days. Smart money is buying.\n\n\uD83D\uDCC9 **Risk Factors:**\n- RSI at 62 on the daily \u2014 approaching overbought\n- Open interest near all-time highs\n- Macro uncertainty from upcoming FOMC\n\n**Verdict:** Cautiously bullish. The accumulation pattern is strong, but high OI means volatility ahead. Key level to watch: $67,500 support.`,
    gemini: `Here's what the data is telling us about BTC right now:\n\n**Social Sentiment:** 72% bullish across crypto Twitter/X. Fear & Greed Index at 68 (Greed). Elevated but not euphoric.\n\n**Technical Picture:**\n\u2022 Trading above 200-day MA \u2014 structural uptrend intact\n\u2022 MACD showing bullish crossover on weekly\n\u2022 Volume profile shows strong support at $65K\n\u2022 Resistance cluster at $72K-$73K\n\n**Smart Money Moves:**\n\u2022 ETF inflows averaging $340M/day this week\n\u2022 Miners not selling \u2014 hash rate at ATH\n\u2022 Stablecoin supply on exchanges increasing (dry powder)\n\n**My read:** The setup is constructive. ETF flows are the dominant force right now, and they're consistently positive. A break above $73K likely triggers a run toward $80K. Downside risk is a flush to $62K if macro deteriorates.\n\n**Risk level:** MODERATE \u2014 position accordingly.`
  }
];

let demoAnimationId = null;

function startDemo(index) {
  document.querySelectorAll('.demo-chip').forEach((c, i) => {
    c.classList.toggle('active', i === index);
  });

  const data = DEMO_DATA[index];
  const claudeEl = document.getElementById('demoResponseClaude');
  const geminiEl = document.getElementById('demoResponseGemini');
  const timerClaude = document.getElementById('demoTimerClaude');
  const timerGemini = document.getElementById('demoTimerGemini');

  claudeEl.textContent = '';
  geminiEl.textContent = '';
  timerClaude.textContent = '0.0s';
  timerGemini.textContent = '0.0s';

  if (demoAnimationId) cancelAnimationFrame(demoAnimationId);

  const startTime = performance.now();
  let claudeIdx = 0;
  let geminiIdx = 0;
  let claudeDone = false;
  let geminiDone = false;
  let lastClaudeTime = 0;
  let lastGeminiTime = 0;
  let claudeInterval = 18 + Math.random() * 20;
  let geminiInterval = 14 + Math.random() * 18;

  function tick(now) {
    const elapsed = now - startTime;

    if (!claudeDone && elapsed - lastClaudeTime > claudeInterval) {
      claudeEl.textContent = data.claude.slice(0, ++claudeIdx);
      lastClaudeTime = elapsed;
      claudeInterval = 18 + Math.random() * 25;
      timerClaude.textContent = (elapsed / 1000).toFixed(1) + 's';
      if (claudeIdx >= data.claude.length) claudeDone = true;
    }

    if (!geminiDone && elapsed - lastGeminiTime > geminiInterval) {
      geminiEl.textContent = data.gemini.slice(0, ++geminiIdx);
      lastGeminiTime = elapsed;
      geminiInterval = 14 + Math.random() * 20;
      timerGemini.textContent = (elapsed / 1000).toFixed(1) + 's';
      if (geminiIdx >= data.gemini.length) geminiDone = true;
    }

    if (!claudeDone || !geminiDone) {
      demoAnimationId = requestAnimationFrame(tick);
    }
  }

  demoAnimationId = requestAnimationFrame(tick);
}

// Auto-trigger demo on scroll into view
const demoSection = document.querySelector('.demo-section');
if (demoSection) {
  demoSection.classList.add('scroll-reveal');
  revealObserver.observe(demoSection);
  const demoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        startDemo(0);
        demoObserver.disconnect();
      }
    });
  }, { threshold: 0.2 });
  demoObserver.observe(demoSection);
}
