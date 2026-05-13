// Meterflow home interactions + UI polish
// Keeps the static landing page resilient: every section is optional and guarded.

(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  // Mobile menu
  const hamburger = $('#hamburger');
  const mobileMenu = $('#mobileMenu');
  window.closeMobile = function closeMobile() {
    hamburger?.classList.remove('active');
    mobileMenu?.classList.remove('open');
  };
  hamburger?.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    mobileMenu?.classList.toggle('open');
  });

  // Inject UI fixes requested on the design branch.
  const style = document.createElement('style');
  style.textContent = `
    .hero-actions {
      display: none !important;
    }

    .hero {
      padding-bottom: clamp(52px, 8vh, 92px) !important;
    }

    .hero-sub {
      margin-bottom: 0 !important;
    }

    .integration-logo-marquee {
      position: relative;
      overflow: hidden;
      padding: 46px 0 56px;
      border-top: 1px solid rgba(255,255,255,.045);
      border-bottom: 1px solid rgba(255,255,255,.045);
      background:
        radial-gradient(circle at 50% 0%, rgba(59,130,246,.08), transparent 42%),
        linear-gradient(180deg, rgba(255,255,255,.018), rgba(255,255,255,.006));
    }

    .integration-logo-marquee::before,
    .integration-logo-marquee::after {
      content: '';
      position: absolute;
      z-index: 2;
      top: 0;
      bottom: 0;
      width: min(18vw, 220px);
      pointer-events: none;
    }

    .integration-logo-marquee::before {
      left: 0;
      background: linear-gradient(90deg, var(--bg, #08090b), transparent);
    }

    .integration-logo-marquee::after {
      right: 0;
      background: linear-gradient(270deg, var(--bg, #08090b), transparent);
    }

    .integration-marquee-label {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin: 0 24px 26px;
      font-family: var(--font-mono, monospace);
      font-size: 11px;
      letter-spacing: .14em;
      text-transform: uppercase;
      color: var(--text-muted, #7b8190);
    }

    .integration-marquee-label span {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 7px;
      color: #4ade80;
      background: rgba(74,222,128,.12);
      border: 1px solid rgba(74,222,128,.18);
      letter-spacing: 0;
      font-weight: 800;
    }

    .integration-marquee-viewport {
      overflow: hidden;
      width: 100%;
    }

    .integration-marquee-track {
      display: flex;
      align-items: center;
      gap: 28px;
      width: max-content;
      animation: meterflowIntegrationMarquee 34s linear infinite;
      will-change: transform;
    }

    .integration-logo-marquee:hover .integration-marquee-track {
      animation-play-state: paused;
    }

    .integration-tile {
      width: 154px;
      min-width: 154px;
      display: grid;
      justify-items: center;
      gap: 14px;
      text-decoration: none;
      color: inherit;
      opacity: .72;
      transition: opacity .22s ease, transform .22s ease;
    }

    .integration-tile:hover {
      opacity: 1;
      transform: translateY(-2px);
    }

    .integration-icon-shell {
      width: 74px;
      height: 74px;
      display: grid;
      place-items: center;
      border-radius: 22px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.018)),
        #15161b;
      border: 1px solid rgba(255,255,255,.075);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.055),
        0 20px 48px rgba(0,0,0,.32);
    }

    .integration-icon-shell img {
      width: 42px;
      height: 42px;
      object-fit: contain;
      border-radius: 12px;
      filter: saturate(1.08) contrast(1.05);
    }

    .integration-name {
      max-width: 154px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--font-body, sans-serif);
      font-size: 13px;
      color: var(--text-muted, #7b8190);
      letter-spacing: -.01em;
    }

    .zauth-footer-cta {
      position: relative;
      padding: clamp(74px, 9vw, 116px) 24px 64px;
      background: #1b1b1e;
      overflow: hidden;
    }

    .zauth-footer-cta::before,
    .zauth-footer::before {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: .42;
      background-image: url("data:image/svg+xml,%3Csvg width='900' height='520' viewBox='0 0 900 520' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23383d45' stroke-width='1.2' opacity='.72'%3E%3Cpath d='M-80 88 C120 58 210 150 365 158 C535 167 650 72 980 60'/%3E%3Cpath d='M-70 128 C130 98 225 195 382 202 C548 210 660 118 980 104'/%3E%3Cpath d='M-90 180 C122 138 235 230 405 238 C575 246 690 160 980 148'/%3E%3Cpath d='M-90 236 C130 188 245 270 430 282 C606 294 720 205 990 195'/%3E%3Cpath d='M-70 300 C160 242 285 330 470 342 C660 355 745 260 990 248'/%3E%3Cpath d='M-90 365 C162 302 315 383 500 392 C695 402 780 320 990 310'/%3E%3Cpath d='M-80 430 C145 385 335 450 540 455 C720 460 820 392 990 386'/%3E%3C/g%3E%3C/svg%3E");
      background-size: 980px 560px;
      background-position: center;
    }

    .zauth-footer-cta-card {
      position: relative;
      z-index: 1;
      max-width: 1080px;
      margin: 0 auto;
      padding: clamp(28px, 5vw, 58px);
      border-radius: 28px;
      background:
        radial-gradient(circle at 88% 14%, rgba(59,130,246,.08), transparent 38%),
        linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.015)),
        #16171a;
      border: 1px solid rgba(255,255,255,.09);
      box-shadow: 0 30px 90px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.055);
      overflow: hidden;
    }

    .zauth-footer-cta-card::after {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: .3;
      background: linear-gradient(105deg, transparent 0 46%, rgba(255,255,255,.055) 50%, transparent 56%);
    }

    .zauth-footer-cta-card h2 {
      position: relative;
      z-index: 1;
      max-width: 780px;
      margin: 0;
      color: var(--text);
      font-family: var(--font-display);
      font-size: clamp(34px, 4.4vw, 58px);
      line-height: 1.02;
      font-weight: 500;
      letter-spacing: -.028em;
    }

    .zauth-footer-cta-card h2 em {
      font-family: var(--font-serif);
      font-style: italic;
      font-weight: 400;
    }

    .zauth-footer-cta-card p {
      position: relative;
      z-index: 1;
      max-width: 760px;
      margin: 20px 0 0;
      color: var(--text-dim);
      font-size: clamp(16px, 1.8vw, 20px);
      line-height: 1.62;
    }

    .zauth-footer-cta-actions {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      margin-top: 36px;
    }

    .zauth-footer-cta-actions a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      padding: 0 26px;
      border-radius: 13px;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
      transition: transform .18s ease, border-color .18s ease, background .18s ease;
    }

    .zauth-footer-cta-actions a:first-child {
      background: var(--accent);
      color: #fff;
      border: 1px solid var(--accent);
    }

    .zauth-footer-cta-actions a:last-child {
      color: var(--text);
      background: rgba(255,255,255,.018);
      border: 1px solid rgba(255,255,255,.2);
    }

    .zauth-footer-cta-actions a:hover {
      transform: translateY(-1px);
    }

    .zauth-footer {
      position: relative !important;
      z-index: 1;
      display: block !important;
      padding: 82px 24px 52px !important;
      margin: 0 !important;
      border-top: 1px solid rgba(255,255,255,.06) !important;
      background: #151519 !important;
      overflow: hidden;
    }

    .zauth-footer > * {
      position: relative;
      z-index: 1;
    }

    .zauth-footer-shell {
      max-width: 1080px;
      margin: 0 auto;
    }

    .zauth-footer-wordmark {
      display: block;
      width: max-content;
      max-width: 100%;
      margin: 0 auto 12px;
      font-family: var(--font-display);
      font-size: clamp(72px, 15vw, 168px);
      line-height: .85;
      font-weight: 800;
      letter-spacing: -.075em;
      text-transform: lowercase;
      color: transparent;
      background-image: radial-gradient(circle, rgba(226,232,240,.55) 1.25px, transparent 1.65px);
      background-size: 8px 8px;
      -webkit-background-clip: text;
      background-clip: text;
      opacity: .56;
    }

    .zauth-footer-tagline {
      margin: 0 auto 48px;
      max-width: 520px;
      text-align: center;
      color: var(--text-muted);
      font-size: 16px;
      line-height: 1.5;
    }

    .zauth-footer-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: clamp(26px, 7vw, 110px);
      max-width: 820px;
      margin: 0 auto 52px;
    }

    .zauth-footer-col h3 {
      margin: 0 0 18px;
      color: var(--text-dim);
      font-family: var(--font-body);
      font-size: 16px;
      font-weight: 500;
      letter-spacing: -.01em;
    }

    .zauth-footer-col a {
      display: flex;
      align-items: center;
      gap: 10px;
      width: fit-content;
      margin: 0 0 14px;
      color: var(--text-muted);
      text-decoration: none;
      font-size: 16px;
      line-height: 1.25;
      transition: color .18s ease;
    }

    .zauth-footer-col a:hover {
      color: var(--text);
    }

    .zauth-footer-col svg {
      width: 18px;
      height: 18px;
      flex: 0 0 auto;
      color: currentColor;
    }

    .zauth-footer-bottom {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 28px;
      flex-wrap: wrap;
      padding-top: 30px;
      border-top: 1px solid rgba(255,255,255,.08);
      color: rgba(161,161,170,.52);
      font-size: 14px;
      text-align: center;
    }

    .zauth-footer-bottom a {
      color: rgba(161,161,170,.6);
      text-decoration: none;
    }

    .zauth-footer-bottom a:hover {
      color: var(--text-dim);
    }

    @keyframes meterflowIntegrationMarquee {
      from { transform: translateX(0); }
      to { transform: translateX(-50%); }
    }

    @media (max-width: 760px) {
      .integration-logo-marquee { padding: 34px 0 42px; }
      .integration-marquee-track { gap: 20px; animation-duration: 26s; }
      .integration-tile { width: 122px; min-width: 122px; gap: 11px; }
      .integration-icon-shell { width: 62px; height: 62px; border-radius: 18px; }
      .integration-icon-shell img { width: 36px; height: 36px; }
      .integration-name { max-width: 122px; font-size: 12px; }
      .zauth-footer-cta { padding: 72px 20px 48px; }
      .zauth-footer-cta-card { padding: 28px; border-radius: 22px; }
      .zauth-footer-cta-actions a { width: 100%; }
      .zauth-footer { padding: 58px 24px 42px !important; }
      .zauth-footer-tagline { margin-bottom: 42px; }
      .zauth-footer-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 18px;
        margin-bottom: 42px;
      }
      .zauth-footer-col h3 { font-size: 14px; margin-bottom: 14px; }
      .zauth-footer-col a { font-size: 13px; margin-bottom: 13px; gap: 7px; }
      .zauth-footer-col svg { width: 15px; height: 15px; }
      .zauth-footer-bottom { gap: 16px; font-size: 12px; }
    }

    @media (max-width: 390px) {
      .zauth-footer-grid { grid-template-columns: 1fr; text-align: center; }
      .zauth-footer-col a { margin-left: auto; margin-right: auto; }
    }

    @media (prefers-reduced-motion: reduce) {
      .integration-marquee-track { animation: none; flex-wrap: wrap; justify-content: center; width: 100%; }
      .integration-logo-marquee::before,
      .integration-logo-marquee::after { display: none; }
    }
  `;
  document.head.appendChild(style);

  function favicon(domain) {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
  }

  const integrations = [
    { name: 'payai.cash', domain: 'payai.cash', url: 'https://payai.cash' },
    { name: 'heurist.xyz', domain: 'heurist.xyz', url: 'https://heurist.xyz' },
    { name: 'silverbackdefi.app', domain: 'silverbackdefi.app', url: 'https://silverbackdefi.app' },
    { name: 'minifetch.com', domain: 'minifetch.com', url: 'https://minifetch.com' },
    { name: 'kodaoracle.com', domain: 'kodaoracle.com', url: 'https://kodaoracle.com' },
    { name: 'x402.org', domain: 'x402.org', url: 'https://x402.org' },
    { name: 'solana.com', domain: 'solana.com', url: 'https://solana.com' },
    { name: 'phantom.com', domain: 'phantom.com', url: 'https://phantom.com' }
  ];

  function makeTile(item) {
    const tile = document.createElement('a');
    tile.className = 'integration-tile';
    tile.href = item.url;
    tile.target = '_blank';
    tile.rel = 'noopener';
    tile.innerHTML = `
      <span class="integration-icon-shell">
        <img src="${favicon(item.domain)}" alt="${item.name} logo" loading="lazy">
      </span>
      <span class="integration-name">${item.name}</span>
    `;
    const img = tile.querySelector('img');
    img.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.textContent = item.name.slice(0, 2).toUpperCase();
      fallback.style.cssText = 'font-family:var(--font-mono,monospace);font-size:18px;font-weight:800;color:#e5e7eb;';
      img.replaceWith(fallback);
    }, { once: true });
    return tile;
  }

  function buildIntegrationMarquee() {
    const existing = $('.integration-logo-marquee');
    if (existing) return;

    const section = document.createElement('section');
    section.className = 'integration-logo-marquee reveal';
    section.setAttribute('aria-label', 'Meterflow integration ecosystem');
    section.innerHTML = `
      <div class="integration-marquee-label"><span>In</span> Integration ecosystem</div>
      <div class="integration-marquee-viewport" aria-live="off">
        <div class="integration-marquee-track"></div>
      </div>
    `;

    const track = $('.integration-marquee-track', section);
    integrations.concat(integrations).forEach((item) => track.appendChild(makeTile(item)));

    const anchor = $('.trusted') || $('.showcase') || $('.stats');
    if (anchor?.parentNode) {
      anchor.parentNode.replaceChild(section, anchor);
    } else {
      document.body.appendChild(section);
    }
  }

  function buildZauthFooter() {
    const footer = $('.site-footer');
    if (!footer) return;

    const cta = $('.cta');
    const ctaMarkup = `
      <section class="zauth-footer-cta reveal" aria-label="Build with Meterflow">
        <div class="zauth-footer-cta-card">
          <h2>Become one with <em>Meterflow.</em></h2>
          <p>Join the providers building the payment, receipt, and spend-control layer for autonomous agents on Solana.</p>
          <div class="zauth-footer-cta-actions">
            <a href="/apply">Strategic Collaboration</a>
            <a href="/docs">Read Documentation</a>
          </div>
        </div>
      </section>
    `;

    if (cta) {
      cta.outerHTML = ctaMarkup;
    } else if (!document.querySelector('.zauth-footer-cta')) {
      footer.insertAdjacentHTML('beforebegin', ctaMarkup);
    }

    footer.className = 'site-footer zauth-footer';
    footer.innerHTML = `
      <div class="zauth-footer-shell">
        <div class="zauth-footer-wordmark" aria-hidden="true">meterflow</div>
        <p class="zauth-footer-tagline">Payment infrastructure for agent commerce.</p>

        <div class="zauth-footer-grid" aria-label="Footer navigation">
          <div class="zauth-footer-col">
            <h3>Products</h3>
            <a href="/dashboard">Dashboard</a>
            <a href="/#tools">Surfaces</a>
            <a href="/token">Token</a>
            <a href="/how-it-works">How it works</a>
          </div>
          <div class="zauth-footer-col">
            <h3>Resources</h3>
            <a href="/docs">Documentation</a>
            <a href="/roadmap">Roadmap</a>
            <a href="/status">Status</a>
            <a href="/apply">Apply as provider</a>
          </div>
          <div class="zauth-footer-col">
            <h3>Connect</h3>
            <a href="https://x.com/meterflowsol" target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.844l-5.36-7.013L4.16 22H.9l8.025-9.17L1.5 2h6.97l4.84 6.4L18.244 2Zm-1.2 18h1.86L7.04 4H5.05l11.994 16Z"/></svg>
              Twitter
            </a>
            <a href="https://discord.gg/tned74z4eN" target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.27 5.33a17.6 17.6 0 0 0-4.43-1.38c-.19.34-.4.78-.55 1.13a16.3 16.3 0 0 0-4.92 0c-.15-.36-.37-.79-.56-1.13a17.6 17.6 0 0 0-4.43 1.38A18.06 18.06 0 0 0 .73 17.51a17.7 17.7 0 0 0 5.34 2.7c.41-.56.78-1.16 1.1-1.79a11.7 11.7 0 0 1-1.67-.8c.11-.08.22-.17.33-.26a12.6 12.6 0 0 0 10.74 0c.11.09.22.18.33.26-.53.31-1.09.58-1.67.8.33.63.7 1.23 1.1 1.79a17.6 17.6 0 0 0 5.35-2.7 17.95 17.95 0 0 0-3.46-12.15ZM8.52 15.33c-1.06 0-1.93-.97-1.93-2.16 0-1.2.86-2.17 1.93-2.17 1.08 0 1.94.98 1.93 2.17 0 1.19-.86 2.16-1.93 2.16Zm6.97 0c-1.06 0-1.93-.97-1.93-2.16 0-1.2.85-2.17 1.93-2.17 1.08 0 1.94.98 1.93 2.17 0 1.19-.85 2.16-1.93 2.16Z"/></svg>
              Discord
            </a>
            <a href="https://github.com/nullxnothing/meterflow" target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.16c-3.22.7-3.9-1.37-3.9-1.37-.53-1.33-1.29-1.68-1.29-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.78 1.2 1.78 1.2 1.04 1.77 2.72 1.26 3.38.96.1-.75.4-1.26.73-1.55-2.57-.3-5.27-1.29-5.27-5.72 0-1.27.45-2.3 1.2-3.11-.12-.3-.52-1.48.11-3.07 0 0 .98-.31 3.18 1.19A10.92 10.92 0 0 1 12 6.23c.98 0 1.96.13 2.88.39 2.2-1.5 3.17-1.19 3.17-1.19.64 1.59.24 2.78.12 3.07.75.82 1.19 1.85 1.19 3.11 0 4.45-2.7 5.42-5.28 5.7.42.37.79 1.08.79 2.18v3.24c0 .31.2.67.8.56A11.5 11.5 0 0 0 12 .7Z"/></svg>
              GitHub
            </a>
          </div>
        </div>

        <div class="zauth-footer-bottom">
          <span>© 2026 Meterflow. All rights reserved.</span>
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Service</a>
        </div>
      </div>
    `;
  }

  buildIntegrationMarquee();
  buildZauthFooter();

  // Showcase tab polish: update labels/status so clicking tabs feels alive.
  const tabCopy = {
    meters: ['metering active', 'Mt', 'meters/', '8 active'],
    receipts: ['receipts verified', 'Rc', 'receipts/', 'live ledger'],
    budgets: ['budget policy live', 'Bg', 'budgets/', 'caps set'],
    provider: ['provider revenue live', 'Pr', 'providers/', 'online']
  };

  $$('.showcase-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.showcase-tab').forEach((btn) => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      const key = tab.dataset.stab || 'meters';
      const copy = tabCopy[key] || tabCopy.meters;
      const detail = $('.status-detail');
      const treeCode = $('.tree-head .tree-code');
      const treeTitle = $('.tree-head span:nth-child(2)');
      const treeMeta = $('.tree-head-meta');
      if (detail) detail.textContent = copy[0];
      if (treeCode) treeCode.textContent = copy[1];
      if (treeTitle) treeTitle.textContent = copy[2];
      if (treeMeta) treeMeta.textContent = copy[3];
    });
  });

  // Scroll reveal
  const revealEls = $$('.reveal, .showcase, .chart');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach((el) => observer.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('in'));
  }

  // Simple static stat fallbacks so the page does not show raw dashes if the API is cold.
  const statFallbacks = {
    'ps-alltime-calls': 'Preview',
    'ps-alltime-tokens': 'USDC',
    'ps-money-saved': 'Live',
    'ps-active-keys': 'Keys',
    'ps-models': 'Routes',
    'ps-uptime': 'Online'
  };
  Object.entries(statFallbacks).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el && (!el.textContent || el.textContent.trim() === '---')) el.textContent = value;
  });

  // Free access banner is optional. Try to populate it without blocking UI.
  (async function initFreeAccessBar() {
    try {
      const bar = $('#freeAccessBar');
      const countdown = $('#freeCountdown');
      if (!bar || !countdown) return;
      const res = await fetch('/proxy/status/aggregate');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.freeAccessEndsAt) return;
      const end = new Date(data.freeAccessEndsAt).getTime();
      if (!Number.isFinite(end) || Date.now() >= end) return;
      document.body.classList.add('free-access-active');
      bar.style.display = 'flex';
      const tick = () => {
        const remaining = end - Date.now();
        if (remaining <= 0) {
          bar.style.display = 'none';
          document.body.classList.remove('free-access-active');
          clearInterval(timer);
          return;
        }
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        countdown.textContent = h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
      };
      const timer = setInterval(tick, 1000);
      tick();
    } catch (_) {}
  })();
})();
