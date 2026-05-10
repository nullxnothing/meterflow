// Mark JS as ready so progressive-enhancement styles activate
document.documentElement.classList.add('js-ready');

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

// ═══════════ PAYMENT CONFIG ═══════════
const PAYMENT_FLOW = 'meter -> quote -> pay -> receipt -> analytics';

// ═══════════ LIVE DATA ═══════════
const PROXY_BASE = '/proxy';

// ═══════════ FREE ACCESS BANNER ═══════════
(async function initFreeAccessBar() {
  try {
    const res = await fetch(`${PROXY_BASE}/status/aggregate`);
    const data = await res.json();
    const endsAt = data.freeAccessEndsAt;
    if (!endsAt) return;

    const endTime = new Date(endsAt).getTime();
    if (Date.now() >= endTime) return;

    const bar = document.getElementById('freeAccessBar');
    const countdown = document.getElementById('freeCountdown');
    if (!bar || !countdown) return;

    document.body.classList.add('free-access-active');
    bar.style.display = 'flex';

    function tick() {
      const remaining = endTime - Date.now();
      if (remaining <= 0) {
        bar.style.display = 'none';
        document.body.classList.remove('free-access-active');
        return;
      }
      const h = Math.floor(remaining / 3_600_000);
      const m = Math.floor((remaining % 3_600_000) / 60_000);
      const s = Math.floor((remaining % 60_000) / 1_000);
      countdown.textContent = h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
      requestAnimationFrame(tick);
    }
    tick();
  } catch { /* silent */ }
})();

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
    console.warn('[Meterflow] Failed to fetch live data:', err);
    fetchFailed = true;
  }
}

function formatCompact(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

// Count-up animation for numbers
const countUpTargets = new Map();
let countUpRaf = null;

function animateCountUp(elementId, target, suffix, duration) {
  if (!suffix) suffix = '';
  if (!duration) duration = 1800;
  const el = document.getElementById(elementId);
  if (!el || target <= 0) return;
  countUpTargets.set(elementId, { el, target, suffix, duration, start: performance.now(), current: 0 });
  if (!countUpRaf) tickCountUp();
}

function tickCountUp() {
  const now = performance.now();
  let hasActive = false;
  countUpTargets.forEach((cfg, id) => {
    const elapsed = now - cfg.start;
    const progress = Math.min(elapsed / cfg.duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.floor(cfg.target * eased);
    if (value !== cfg.current) {
      cfg.current = value;
      cfg.el.textContent = formatCompact(value) + cfg.suffix;
    }
    if (progress < 1) hasActive = true;
    else countUpTargets.delete(id);
  });
  if (hasActive) countUpRaf = requestAnimationFrame(tickCountUp);
  else countUpRaf = null;
}

function formatUptime(ms) {
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) return Math.floor(hours / 24) + 'd ' + (hours % 24) + 'h';
  return hours + 'h ' + Math.floor((ms % 3_600_000) / 60_000) + 'm';
}

// Blended value proxy across bundled metered services.
const BLENDED_COST_PER_TOKEN = 5.5 / 1_000_000;

function formatUsd(amount) {
  if (amount >= 1000) return '$' + (amount / 1000).toFixed(1) + 'K';
  if (amount >= 1) return '$' + amount.toFixed(2);
  return '$' + amount.toFixed(2);
}

let statsAnimated = false;

function populateProtocolStats() {
  const el = (id) => document.getElementById(id);

  const callsToday = liveStats.totalCallsToday || 0;
  const tokensToday = liveStats.totalTokensToday || 0;
  const allTimeCalls = liveStats.allTimeCalls || 0;
  const allTimeTokens = liveStats.allTimeTokens || 0;
  const keys = liveStats.totalKeysIssued || 0;
  const activeProviders = liveStats.activeProviders || 0;
  const providers = liveStats.providers || {};
  const uptimeMs = liveStats.uptimeMs || 0;

  const balSol = liveTreasury.treasuryBalanceSol || 0;
  const balUsd = liveTreasury.treasuryBalanceUsd || 0;
  const runway = liveTreasury.runwayDays || 0;
  const health = liveTreasury.healthStatus || 'unknown';

  // Money saved calculation
  const moneySaved = allTimeTokens * BLENDED_COST_PER_TOKEN;

  // Hero stats with count-up on first load
  const isFirstAnimation = !statsAnimated && (allTimeCalls > 0 || allTimeTokens > 0);
  if (isFirstAnimation) {
    animateCountUp('ps-alltime-calls', allTimeCalls, '', 2200);
    animateCountUp('ps-alltime-tokens', allTimeTokens, '', 2200);
    statsAnimated = true;
  } else {
    el('ps-alltime-calls').textContent = allTimeCalls > 0 ? formatCompact(allTimeCalls) : '--';
    el('ps-alltime-tokens').textContent = allTimeTokens > 0 ? formatCompact(allTimeTokens) : '--';
  }

  // Money saved — animate alongside the hero stats
  const savedEl = el('ps-money-saved');
  if (savedEl) {
    if (moneySaved > 0 && isFirstAnimation) {
      const savedStart = performance.now();
      function tickSaved(now) {
        const progress = Math.min((now - savedStart) / 2200, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        savedEl.textContent = formatUsd(moneySaved * eased);
        if (progress < 1) requestAnimationFrame(tickSaved);
      }
      requestAnimationFrame(tickSaved);
    } else {
      savedEl.textContent = moneySaved > 0 ? formatUsd(moneySaved) : '--';
    }
  }

  el('ps-calls-today').textContent = formatCompact(callsToday);
  el('ps-tokens-today').textContent = tokensToday > 0 ? formatCompact(tokensToday) + ' units' : 'billable units';
  el('ps-active-keys').textContent = formatCompact(keys);
  el('ps-treasury').textContent = balSol > 0 ? balSol.toFixed(2) + ' SOL' : '--';
  el('ps-treasury-usd').textContent = balUsd > 0 ? '$' + formatCompact(Math.round(balUsd)) : (fetchFailed ? 'offline' : 'loading...');
  el('ps-runway').textContent = runway > 0 ? runway + 'd' : (runway === Infinity || liveTreasury.runwayDays === '\u221E' ? '\u221E' : '--');
  el('ps-health').textContent = health !== 'unknown' ? health : (fetchFailed ? 'offline' : 'loading...');
  updateStatusIndicator(fetchFailed ? 'offline' : health);

  // Services online
  const providerNames = Object.entries(providers).filter(([, v]) => v).map(([k]) => k);
  el('ps-models').textContent = activeProviders > 0 ? activeProviders : '--';
  el('ps-providers').textContent = providerNames.length > 0 ? providerNames.join(' / ') : (fetchFailed ? 'offline' : 'loading...');

  // Uptime
  el('ps-uptime').textContent = uptimeMs > 0 ? formatUptime(uptimeMs) : '--';
  el('ps-uptime-pct').textContent = uptimeMs > 0 ? 'current session' : (fetchFailed ? 'offline' : 'loading...');
}

function updateStatusIndicator(status) {
  const indicator = document.getElementById('statusIndicator');
  if (!indicator) return;
  const text = indicator.querySelector('.status-indicator-text');
  const normalized = String(status || 'unknown').toLowerCase();
  indicator.classList.remove('degraded', 'offline');
  if (normalized === 'offline') {
    indicator.classList.add('offline');
    if (text) text.textContent = 'API status unavailable';
    return;
  }
  if (['cautious', 'degraded', 'warning'].includes(normalized)) {
    indicator.classList.add('degraded');
    if (text) text.textContent = 'API operating with warnings';
    return;
  }
  if (text) text.textContent = 'All systems operational';
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

// ═══════════ PAYMENT FLOW SUMMARY ═══════════
function populateToken() {
  const mint = liveStats.tokenMint;

  const heroCa = document.querySelector('.hero-ca');
  if (heroCa) heroCa.classList.remove('pending');

  const caEl = document.getElementById('caAddress');
  const buyLink = document.getElementById('buyLink');
  const ctaBuyLink = document.getElementById('ctaBuyLink');
  const footerDex = document.getElementById('footerDex');
  const treasuryLink = document.getElementById('treasurySolscan');

  if (caEl) caEl.textContent = PAYMENT_FLOW;

  if (buyLink) {
    buyLink.href = '/docs';
    buyLink.removeAttribute('target');
    buyLink.removeAttribute('rel');
  }

  if (ctaBuyLink) {
    ctaBuyLink.href = '/docs';
    ctaBuyLink.removeAttribute('target');
    ctaBuyLink.removeAttribute('rel');
    ctaBuyLink.classList.remove('disabled');
  }

  if (footerDex && mint) {
    footerDex.href = `https://dexscreener.com/solana/${mint}`;
  }

  if (treasuryLink && liveTreasury.wallet) {
    treasuryLink.href = `https://solscan.io/account/${liveTreasury.wallet}`;
  }

  document.querySelectorAll('.tier-btn').forEach(btn => {
    btn.onclick = () => window.location.href = btn.textContent.includes('Docs') ? '/docs' : '/dashboard';
  });
}

// ═══════════ INIT ═══════════
fetchLiveData().then(() => {
  clearTimeout(dataTimeout);
  populateToken();
  populateProtocolStats();
});

// Show placeholder values if data doesn't arrive in time
const dataTimeout = setTimeout(() => {
  if (!liveStats.totalCallsToday && !liveTreasury.treasuryBalanceSol) {
    fetchFailed = true;
    populateProtocolStats();
  }
}, 8_000);

setInterval(async () => {
  await fetchLiveData();
  populateProtocolStats();
}, 30_000);

// ═══════════ AGENT TABS ═══════════
function showTab(tab) {
  document.getElementById('tabHuman').classList.toggle('active', tab === 'human');
  document.getElementById('tabAgent').classList.toggle('active', tab === 'agent');
  document.getElementById('btnHuman').classList.toggle('active', tab === 'human');
  document.getElementById('btnAgent').classList.toggle('active', tab === 'agent');
}

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

document.querySelectorAll('.hooks-section, .protocol-stats, .how-section, .tools-section, .tiers-section, .funded-section, .agent-section, .faq-section, .cta-section, .demo-section').forEach(el => {
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
document.querySelectorAll('.tool-card, .how-step, .tier-card, .funded-step, .stat-block, .stats-hero-block, .hook-card').forEach(card => {
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
  let particleRafId = null;

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
      ctx.fillStyle = `rgba(79, 156, 255, ${p.a})`;
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
            ctx.strokeStyle = `rgba(79, 156, 255, ${0.02 * (1 - dist / 22500)})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
    }
    particleRafId = requestAnimationFrame(drawParticles);
  }

  resizeBg();
  initParticles();
  drawParticles();

  window.addEventListener('resize', () => { resizeBg(); initParticles(); });

  // Pause animation when tab is hidden to save CPU
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(particleRafId);
      particleRafId = null;
    } else if (!particleRafId) {
      drawParticles();
    }
  });
}

// ═══════════ LIVE DEMO ═══════════
const DEMO_DATA = [
  {
    prompt: 'Endpoint revenue',
    claude: `Provider View\n\nEndpoint: /v1/risk-score\nPrice: 0.006 USDC per call\nStatus: Live\n\nToday:\n- 8,421 meter hits\n- 7,904 paid responses\n- 311 failed payments\n- 206 policy rejections\n\nRevenue:\n- Gross: 47.42 USDC\n- Median latency: 412ms\n- Top consumer: agent_7Kp...91a\n\nMeterflow is not just checking payment. It is showing what the endpoint earned, where calls failed, and whether the route is worth scaling.`,
    gemini: `Agent View\n\nAgent: market-research-bot\nBudget: 12.00 USDC / day\nSpent: 3.84 USDC\nRemaining: 8.16 USDC\n\nAllowed endpoints:\n- /v1/risk-score\n- /v1/social-scan\n- /v1/token-liquidity\n\nRecent receipt:\nrcpt_41bd\n0.006 USDC\n/v1/risk-score\nverified on Solana\n\nThe operator can let the agent work without giving it unlimited payment authority.`
  },
  {
    prompt: 'Agent budget',
    claude: `Provider View\n\nBudget policy matched:\npolicy_agent_research_v2\n\nThis request is allowed because:\n- endpoint is approved\n- agent has 8.16 USDC remaining\n- requested price is below per-call cap\n- wallet is not revoked\n\nQuote issued:\nqt_8f21\nexpires in 90 seconds\nprice: 0.006 USDC`,
    gemini: `Agent View\n\nBefore payment:\nTask budget: 12.00 USDC\nEndpoint cap: 0.02 USDC per call\nDaily request cap: 2,000\n\nDecision:\nPay 0.006 USDC for /v1/risk-score\nExpected utility: high\nRemaining after call: 8.154 USDC\n\nMeterflow gives the agent enough context to spend intentionally, not blindly.`
  },
  {
    prompt: 'Failed payment',
    claude: `Provider View\n\nRequest blocked:\n/v1/social-scan\n\nReason:\nagent budget exceeded\n\nNo response was served.\nNo revenue was counted.\nReceipt status: failed_policy\n\nThis matters because a payment rail alone cannot tell a provider why revenue was lost. Meterflow turns failed payments into operational data.`,
    gemini: `Agent View\n\nPayment denied.\n\nWhy:\n- daily budget already spent\n- endpoint not critical to current task\n- operator approval required for further calls\n\nNext action:\nstop workflow or request budget increase\n\nThe agent does not keep retrying blindly, and the operator has a clean audit trail.`
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
  let demoStarted = false;
  const demoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !demoStarted) {
        demoStarted = true;
        startDemo(0);
        demoObserver.disconnect();
      }
    });
  }, { threshold: 0.2 });
  demoObserver.observe(demoSection);
}
