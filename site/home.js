// Meterflow landing polish: mobile menu, integration slider, and zauth-inspired footer.
(function () {
  const ready = (fn) => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  ready(() => {
    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

    const style = document.createElement('style');
    style.textContent = `
      .hero-actions,
      .nav-cta,
      .mobile-menu-cta.primary,
      .free-access-topbar-btn,
      a[href='/dashboard'].btn-primary,
      a[href='/dashboard'].nav-cta {
        display: none !important;
      }

      .hero { padding-bottom: clamp(52px, 8vh, 92px) !important; }
      .hero-sub { margin-bottom: 0 !important; }
      body.mobile-menu-open { overflow: hidden; }

      #hamburger { position: relative; z-index: 10001; }
      #mobileMenu.mobile-menu.open,
      body.mobile-menu-open #mobileMenu.mobile-menu {
        display: flex !important;
        position: fixed !important;
        top: 60px !important;
        left: 0 !important;
        right: 0 !important;
        z-index: 10000 !important;
        max-height: calc(100vh - 60px);
        overflow-y: auto;
        background: rgba(6, 7, 10, .98) !important;
        border-bottom: 1px solid rgba(255,255,255,.08) !important;
        box-shadow: 0 30px 80px rgba(0,0,0,.48);
      }

      .integration-logo-marquee {
        position: relative;
        overflow: hidden;
        padding: 46px 0 56px;
        border-top: 1px solid rgba(255,255,255,.045);
        border-bottom: 1px solid rgba(255,255,255,.045);
        background: radial-gradient(circle at 50% 0%, rgba(59,130,246,.08), transparent 42%), linear-gradient(180deg, rgba(255,255,255,.018), rgba(255,255,255,.006));
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
      .integration-logo-marquee::before { left: 0; background: linear-gradient(90deg, var(--bg, #08090b), transparent); }
      .integration-logo-marquee::after { right: 0; background: linear-gradient(270deg, var(--bg, #08090b), transparent); }
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
      .integration-marquee-viewport { overflow: hidden; width: 100%; }
      .integration-marquee-track {
        display: flex;
        align-items: center;
        gap: 28px;
        width: max-content;
        animation: meterflowIntegrationMarquee 34s linear infinite;
        will-change: transform;
      }
      .integration-logo-marquee:hover .integration-marquee-track { animation-play-state: paused; }
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
      .integration-tile:hover { opacity: 1; transform: translateY(-2px); }
      .integration-icon-shell {
        width: 74px;
        height: 74px;
        display: grid;
        place-items: center;
        border-radius: 22px;
        background: linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.018)), #15161b;
        border: 1px solid rgba(255,255,255,.075);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.055), 0 20px 48px rgba(0,0,0,.32);
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
        font-size: 13px;
        color: var(--text-muted, #7b8190);
        letter-spacing: -.01em;
      }

      .zauth-footer-cta,
      .zauth-footer {
        position: relative;
        overflow: hidden;
        background: #17171b !important;
      }
      .zauth-footer-cta { padding: clamp(74px, 9vw, 116px) 24px 64px; }
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
        background: radial-gradient(circle at 88% 14%, rgba(59,130,246,.08), transparent 38%), linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.015)), #16171a;
        border: 1px solid rgba(255,255,255,.09);
        box-shadow: 0 30px 90px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.055);
      }
      .zauth-footer-cta-card h2 {
        margin: 0;
        color: var(--text);
        font-family: var(--font-display);
        font-size: clamp(34px, 4.4vw, 58px);
        line-height: 1.02;
        font-weight: 500;
        letter-spacing: -.028em;
      }
      .zauth-footer-cta-card p {
        max-width: 760px;
        margin: 20px 0 0;
        color: var(--text-dim);
        font-size: clamp(16px, 1.8vw, 20px);
        line-height: 1.62;
      }
      .zauth-footer-cta-actions {
        display: flex;
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
      }
      .zauth-footer-cta-actions a:first-child { background: var(--accent); color: #fff; border: 1px solid var(--accent); }
      .zauth-footer-cta-actions a:last-child { color: var(--text); background: rgba(255,255,255,.018); border: 1px solid rgba(255,255,255,.2); }

      .zauth-footer {
        display: block !important;
        padding: 76px 24px 48px !important;
        margin: 0 !important;
        border-top: 1px solid rgba(255,255,255,.06) !important;
      }
      .zauth-footer > * { position: relative; z-index: 1; }
      .zauth-footer-shell { max-width: 1080px; margin: 0 auto; }
      .zauth-footer-brand {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: clamp(14px, 2.4vw, 24px);
        margin: 0 auto 18px;
        color: var(--text);
        text-decoration: none;
        font-family: var(--font-display);
        font-size: clamp(46px, 9vw, 112px);
        line-height: .95;
        font-weight: 700;
        letter-spacing: -.055em;
      }
      .zauth-footer-brand img { width: .7em; height: .7em; flex: 0 0 auto; }
      .zauth-footer-tagline {
        margin: 0 auto 50px;
        max-width: 560px;
        text-align: center;
        color: var(--text-muted);
        font-size: clamp(16px, 2vw, 22px);
        line-height: 1.5;
      }
      .zauth-footer-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(150px, 180px));
        justify-content: center;
        justify-items: center;
        gap: clamp(36px, 8vw, 118px);
        width: 100%;
        margin: 0 auto 56px;
      }
      .zauth-footer-col { width: 100%; text-align: left; }
      .zauth-footer-col h3 {
        margin: 0 0 18px;
        color: var(--text-dim);
        font-size: 18px;
        font-weight: 600;
        letter-spacing: -.012em;
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
      }
      .zauth-footer-col a:hover { color: var(--text); }
      .zauth-footer-col svg { width: 18px; height: 18px; flex: 0 0 auto; }
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
      .zauth-footer-bottom a { color: rgba(161,161,170,.6); text-decoration: none; }

      @keyframes meterflowIntegrationMarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }

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
        .zauth-footer { padding: 56px 20px 42px !important; }
        .zauth-footer-tagline { margin-bottom: 42px; }
        .zauth-footer-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin-bottom: 42px; }
        .zauth-footer-col h3 { font-size: 14px; margin-bottom: 14px; }
        .zauth-footer-col a { font-size: 13px; margin-bottom: 13px; gap: 7px; }
        .zauth-footer-col svg { width: 15px; height: 15px; }
        .zauth-footer-bottom { gap: 16px; font-size: 12px; }
      }
      @media (max-width: 430px) {
        .zauth-footer-grid { grid-template-columns: 1fr; max-width: 210px; gap: 28px; }
        .zauth-footer-col { text-align: center; }
        .zauth-footer-col a { margin-left: auto; margin-right: auto; }
      }
      @media (prefers-reduced-motion: reduce) {
        .integration-marquee-track { animation: none; flex-wrap: wrap; justify-content: center; width: 100%; }
        .integration-logo-marquee::before, .integration-logo-marquee::after { display: none; }
      }
    `;
    document.head.appendChild(style);

    function closeMobile() {
      $('#hamburger')?.classList.remove('active');
      $('#mobileMenu')?.classList.remove('open');
      document.body.classList.remove('mobile-menu-open');
      $('#hamburger')?.setAttribute('aria-expanded', 'false');
    }
    window.closeMobile = closeMobile;

    const hamburger = $('#hamburger');
    const mobileMenu = $('#mobileMenu');
    if (hamburger && mobileMenu) {
      hamburger.setAttribute('type', 'button');
      hamburger.setAttribute('aria-expanded', 'false');
      hamburger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const open = !mobileMenu.classList.contains('open');
        hamburger.classList.toggle('active', open);
        mobileMenu.classList.toggle('open', open);
        document.body.classList.toggle('mobile-menu-open', open);
        hamburger.setAttribute('aria-expanded', String(open));
      });
      mobileMenu.addEventListener('click', (event) => {
        if (event.target.closest('a')) closeMobile();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeMobile();
      });
    }

    const integrations = [
      ['payai.cash', 'payai.cash'],
      ['heurist.xyz', 'heurist.xyz'],
      ['silverbackdefi.app', 'silverbackdefi.app'],
      ['minifetch.com', 'minifetch.com'],
      ['kodaoracle.com', 'kodaoracle.com'],
      ['x402.org', 'x402.org'],
      ['solana.com', 'solana.com'],
      ['phantom.com', 'phantom.com']
    ];

    function favicon(domain) {
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
    }

    function buildIntegrationMarquee() {
      if ($('.integration-logo-marquee')) return;
      const section = document.createElement('section');
      section.className = 'integration-logo-marquee reveal';
      section.setAttribute('aria-label', 'Meterflow integration ecosystem');
      section.innerHTML = `
        <div class="integration-marquee-label"><span>In</span> Integration ecosystem</div>
        <div class="integration-marquee-viewport" aria-live="off"><div class="integration-marquee-track"></div></div>
      `;
      const track = $('.integration-marquee-track', section);
      integrations.concat(integrations).forEach(([name, domain]) => {
        const tile = document.createElement('a');
        tile.className = 'integration-tile';
        tile.href = `https://${domain}`;
        tile.target = '_blank';
        tile.rel = 'noopener';
        tile.innerHTML = `<span class="integration-icon-shell"><img src="${favicon(domain)}" alt="${name} logo" loading="lazy"></span><span class="integration-name">${name}</span>`;
        track.appendChild(tile);
      });
      const anchor = $('.trusted') || $('.showcase') || $('.stats');
      if (anchor?.parentNode) anchor.parentNode.replaceChild(section, anchor);
    }

    function buildFooter() {
      const footer = $('.site-footer');
      if (!footer) return;

      const cta = $('.cta');
      const ctaMarkup = `
        <section class="zauth-footer-cta reveal" aria-label="Build with Meterflow">
          <div class="zauth-footer-cta-card">
            <h2>Become one with <em>Meterflow.</em></h2>
            <p>Join the providers building the payment, receipt, and spend-control layer for autonomous agents on Solana.</p>
            <div class="zauth-footer-cta-actions"><a href="/apply">Strategic Collaboration</a><a href="/docs">Read Documentation</a></div>
          </div>
        </section>
      `;
      if (cta) cta.outerHTML = ctaMarkup;

      footer.className = 'site-footer zauth-footer';
      footer.innerHTML = `
        <div class="zauth-footer-shell">
          <a class="zauth-footer-brand" href="/" aria-label="Meterflow home"><img src="/assets/brand/meterflow-mark.svg" alt="" aria-hidden="true"><span>Meterflow</span></a>
          <p class="zauth-footer-tagline">Payment infrastructure for agent commerce.</p>
          <div class="zauth-footer-grid" aria-label="Footer navigation">
            <div class="zauth-footer-col"><h3>Products</h3><a href="/dashboard">Dashboard</a><a href="/#tools">Surfaces</a><a href="/token">Token</a><a href="/how-it-works">How it works</a></div>
            <div class="zauth-footer-col"><h3>Resources</h3><a href="/docs">Documentation</a><a href="/roadmap">Roadmap</a><a href="/status">Status</a><a href="/apply">Apply as provider</a></div>
            <div class="zauth-footer-col"><h3>Connect</h3><a href="https://x.com/meterflowsol" target="_blank" rel="noopener">Twitter</a><a href="https://discord.gg/tned74z4eN" target="_blank" rel="noopener">Discord</a><a href="https://github.com/nullxnothing/meterflow" target="_blank" rel="noopener">GitHub</a></div>
          </div>
          <div class="zauth-footer-bottom"><span>© 2026 Meterflow. All rights reserved.</span><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a></div>
        </div>
      `;
    }

    function initTabs() {
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
          const copy = tabCopy[tab.dataset.stab || 'meters'] || tabCopy.meters;
          $('.status-detail') && ($('.status-detail').textContent = copy[0]);
          $('.tree-head .tree-code') && ($('.tree-head .tree-code').textContent = copy[1]);
          $('.tree-head span:nth-child(2)') && ($('.tree-head span:nth-child(2)').textContent = copy[2]);
          $('.tree-head-meta') && ($('.tree-head-meta').textContent = copy[3]);
        });
      });
    }

    function initReveal() {
      const els = $$('.reveal, .showcase, .chart');
      if (!('IntersectionObserver' in window)) {
        els.forEach((el) => el.classList.add('in', 'visible'));
        return;
      }
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in', 'visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: .16, rootMargin: '0px 0px -8% 0px' });
      els.forEach((el) => observer.observe(el));
    }

    function statFallbacks() {
      const data = {
        'ps-alltime-calls': 'Preview',
        'ps-alltime-tokens': 'USDC',
        'ps-money-saved': 'Live',
        'ps-active-keys': 'Keys',
        'ps-models': 'Routes',
        'ps-uptime': 'Online'
      };
      Object.entries(data).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el && (!el.textContent || el.textContent.trim() === '---')) el.textContent = value;
      });
    }

    buildIntegrationMarquee();
    buildFooter();
    initTabs();
    initReveal();
    statFallbacks();
  });
})();
