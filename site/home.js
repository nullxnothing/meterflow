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
    .hero-actions,
    .cta-actions {
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

  buildIntegrationMarquee();

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
