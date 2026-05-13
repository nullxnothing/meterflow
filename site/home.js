// Meterflow landing polish: refined nav, prominent Launch Dashboard CTA,
// GSAP-driven highlight scroll text, layered "six surfaces" footer, mobile menu.
(function () {
  const ready = (fn) => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  ready(() => {
    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const style = document.createElement('style');
    style.textContent = `
      body.mobile-menu-open{overflow:hidden}
      #hamburger{position:relative;z-index:10001}
      #mobileMenu.mobile-menu.open,body.mobile-menu-open #mobileMenu.mobile-menu{display:flex!important;position:fixed!important;top:72px!important;left:0!important;right:0!important;z-index:10000!important;max-height:calc(100vh - 72px);overflow-y:auto;background:rgba(6,7,10,.98)!important;border-bottom:1px solid rgba(255,255,255,.08)!important;box-shadow:0 30px 80px rgba(0,0,0,.48)}

      /* ─── Unified Meterflow nav: dark glass, text-first, no route-code chips ─── */
      body > nav.mf-nav{height:72px;padding:0 clamp(20px,3.4vw,42px)!important;display:flex;align-items:center;gap:18px;justify-content:space-between;background:linear-gradient(180deg,rgba(5,8,15,.84),rgba(5,8,15,.56))!important;backdrop-filter:saturate(145%) blur(18px);-webkit-backdrop-filter:saturate(145%) blur(18px);border-bottom:1px solid rgba(156,184,220,.1)!important;box-shadow:0 18px 70px rgba(0,0,0,.2)!important;position:fixed;top:0;left:0;right:0;z-index:300}
      body.mf-nav-scrolled > nav.mf-nav{background:linear-gradient(180deg,rgba(5,8,15,.92),rgba(5,8,15,.7))!important;border-bottom-color:rgba(156,184,220,.14)!important;transition:background .25s ease,border-color .25s ease,box-shadow .25s ease}
      body > nav.mf-nav .nav-logo{font-family:var(--font-serif,'Instrument Serif',Georgia,serif);font-style:italic;font-size:25px;line-height:1;letter-spacing:-.02em;text-transform:none;font-weight:400;color:rgba(244,248,255,.92);display:inline-flex;align-items:center;gap:9px;text-decoration:none;transition:color .2s ease}
      body > nav.mf-nav .nav-logo:hover{color:#fff}
      body > nav.mf-nav .nav-logo .brand-mark{width:19px;height:19px;display:block;opacity:.9;filter:drop-shadow(0 0 14px rgba(var(--accent-rgb),.34))}
      body > nav.mf-nav .nav-links{display:flex;align-items:center;gap:6px;justify-content:center;flex:1;padding:0 12px}
      body > nav.mf-nav .nav-links a{display:inline-flex;align-items:center;gap:0;padding:9px 13px;border-radius:10px;font-size:13px;line-height:1;font-weight:550;color:rgba(174,193,220,.72);text-decoration:none;border:1px solid transparent;transition:color .18s ease,background .18s ease,border-color .18s ease,box-shadow .18s ease}
      body > nav.mf-nav .nav-links a::after{display:none!important}
      body > nav.mf-nav .nav-links a:hover{color:#fff;background:rgba(255,255,255,.045);border-color:rgba(156,184,220,.1)}
      body > nav.mf-nav .nav-links a.active{color:#fff;background:rgba(var(--accent-rgb),.1);border-color:rgba(var(--accent-rgb),.18);box-shadow:0 0 24px rgba(var(--accent-rgb),.08)}
      body > nav.mf-nav .nav-glyph{display:none!important}
      body > nav.mf-nav .nav-actions{display:flex;align-items:center;gap:10px}
      body > nav.mf-nav .nav-socials{display:inline-flex;align-items:center;gap:2px}
      body > nav.mf-nav .nav-social{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;color:rgba(225,228,236,.5);transition:color .18s ease,background .18s ease}
      body > nav.mf-nav .nav-social:hover{color:#fff;background:rgba(255,255,255,.04)}
      body > nav.mf-nav .nav-social svg{width:14px;height:14px}

      /* ─── Tiny zauth-style "Log in" button ─── */
      .mf-login{display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:36px;padding:0 15px;border-radius:10px;font-family:var(--font-body),system-ui,sans-serif;font-size:13.5px;font-weight:600;letter-spacing:-.005em;color:var(--text);text-decoration:none;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.11);transition:color .18s ease,background .18s ease,border-color .18s ease,transform .18s ease,box-shadow .18s ease}
      .mf-login:hover{color:#fff;background:rgba(var(--accent-rgb),.08);border-color:rgba(var(--accent-rgb),.32);box-shadow:0 0 24px rgba(var(--accent-rgb),.10);transform:translateY(-1px)}
      .mf-login-wallet{width:15px;height:15px;color:var(--accent);opacity:.9;display:block}
      .mf-login:hover .mf-login-wallet{opacity:1}

      /* Hero needs top padding now that the nav is absolutely positioned */
      section.hero{padding-top:clamp(120px,14vh,170px)!important}

      @media(max-width:1180px){body > nav.mf-nav{height:64px!important}body > nav.mf-nav .nav-links{display:none!important}body > nav.mf-nav .nav-socials{display:none!important}body > nav.mf-nav .nav-actions{display:none!important}body > nav.mf-nav .hamburger{display:flex!important}#mobileMenu.mobile-menu.open,body.mobile-menu-open #mobileMenu.mobile-menu{top:64px!important;max-height:calc(100vh - 64px)!important}}
      @media(max-width:480px){body > nav.mf-nav{height:60px!important}#mobileMenu.mobile-menu.open,body.mobile-menu-open #mobileMenu.mobile-menu{top:60px!important;max-height:calc(100vh - 60px)!important}}
      @media(max-width:560px){.mf-login{padding:6px 10px 6px 10px;font-size:12.5px}}

      /* ─── Section polish ─── */
      .hero-headline,.section-title,.cta-title{letter-spacing:-.035em}
      .hero-sub,.section-sub{color:rgba(225,228,236,.62)!important}
      .mf-load{opacity:0;transform:translateY(18px);filter:blur(6px);transition:opacity .9s cubic-bezier(.2,.65,.3,1),transform .9s cubic-bezier(.2,.65,.3,1),filter .9s cubic-bezier(.2,.65,.3,1);will-change:transform,opacity,filter}
      .mf-load.mf-in{opacity:1;transform:none;filter:blur(0)}

      /* ─── Integration marquee ─── */
      .integration-logo-marquee{position:relative;overflow:hidden;padding:46px 0 56px;border-top:1px solid rgba(255,255,255,.045);border-bottom:1px solid rgba(255,255,255,.045);background:radial-gradient(circle at 50% 0%,rgba(var(--accent-rgb),.08),transparent 42%),linear-gradient(180deg,rgba(255,255,255,.018),rgba(255,255,255,.006))}
      .integration-logo-marquee:before,.integration-logo-marquee:after{content:'';position:absolute;z-index:2;top:0;bottom:0;width:min(18vw,220px);pointer-events:none}
      .integration-logo-marquee:before{left:0;background:linear-gradient(90deg,var(--bg,#08090b),transparent)}
      .integration-logo-marquee:after{right:0;background:linear-gradient(270deg,var(--bg,#08090b),transparent)}
      .integration-marquee-viewport{overflow:hidden;width:100%}
      .integration-marquee-track{display:flex;align-items:center;gap:28px;width:max-content;animation:meterflowIntegrationMarquee 34s linear infinite;will-change:transform}
      .integration-logo-marquee:hover .integration-marquee-track{animation-play-state:paused}
      .integration-tile{width:154px;min-width:154px;display:grid;justify-items:center;gap:14px;text-decoration:none;color:inherit;opacity:.72;transition:opacity .22s ease,transform .22s ease}
      .integration-tile:hover{opacity:1;transform:translateY(-2px)}
      .integration-icon-shell{width:74px;height:74px;display:grid;place-items:center;border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.018)),#15161b;border:1px solid rgba(255,255,255,.075);box-shadow:inset 0 1px 0 rgba(255,255,255,.055),0 20px 48px rgba(0,0,0,.32)}
      .integration-icon-shell img{width:42px;height:42px;object-fit:contain;border-radius:12px;filter:saturate(1.08) contrast(1.05)}
      .integration-name{max-width:154px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:var(--text-muted,#7b8190);letter-spacing:-.01em}
      @keyframes meterflowIntegrationMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}

      /* ─── Highlight scroll text reveal (GSAP-driven) ─── */
      .mf-text-reveal{position:relative;background:#0a0a0c}
      .mf-text-reveal-sticky{position:sticky;top:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:9vh 24px;text-align:left}
      .mf-reveal-eyebrow{font-family:var(--font-mono);text-transform:uppercase;letter-spacing:.22em;font-size:11px;color:var(--accent,#4f9cff);margin-bottom:28px;display:inline-flex;align-items:center;gap:10px}
      .mf-reveal-eyebrow::before{content:'';width:24px;height:1px;background:currentColor;opacity:.6}
      .mf-reveal-words{max-width:1040px;margin:0;font-family:var(--font-display);font-size:clamp(28px,4.6vw,60px);line-height:1.14;font-weight:600;letter-spacing:-.035em;color:rgba(255,255,255,.14)}
      .mf-word{display:inline-block;margin:.02em .14em .02em 0;color:rgba(255,255,255,.14)}
      .mf-text-reveal.mf-fallback .mf-word.lit{color:#fff}
      .mf-text-reveal.mf-fallback .mf-word.accent.lit{color:var(--accent,#4f9cff);text-shadow:0 0 22px rgba(var(--accent-rgb),.45)}
      .mf-word em{font-family:var(--font-serif);font-style:italic;font-weight:400}

      /* ─── Landing footer shell ─── */
      .mf-site-footer{background:#0a0a0c;border-top:1px solid rgba(255,255,255,.06);padding:30px 24px 36px}
      .mf-site-footer-shell{max-width:1180px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:22px;color:rgba(225,228,236,.44);font-family:var(--font-mono);font-size:12px;letter-spacing:.02em}
      .mf-site-footer-links{display:inline-flex;align-items:center;gap:18px;flex-wrap:wrap}
      .mf-site-footer a{color:rgba(225,228,236,.68);text-decoration:none;transition:color .18s ease}
      .mf-site-footer a:hover{color:#fff}
      @media(max-width:720px){.mf-site-footer-shell{flex-direction:column;align-items:flex-start}}
      @media(prefers-reduced-motion:reduce){.integration-marquee-track{animation:none;flex-wrap:wrap;justify-content:center;width:100%}.mf-load{opacity:1;transform:none;filter:none}.mf-launch-glow{animation:none}}
    `;
    document.head.appendChild(style);

    /* ────────────────────────────────────────────── Mobile menu ─ */
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
      mobileMenu.addEventListener('click', (event) => { if (event.target.closest('a')) closeMobile(); });
      document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMobile(); });
    }

    /* ────────────────────────────────────────────── Integration marquee ─ */
    const integrations = [['payai.cash','payai.cash'],['heurist.xyz','heurist.xyz'],['silverbackdefi.app','silverbackdefi.app'],['minifetch.com','minifetch.com'],['kodaoracle.com','kodaoracle.com'],['x402.org','x402.org'],['solana.com','solana.com'],['phantom.com','phantom.com']];
    const favicon = () => '/assets/brand/meterflow-mark.svg';

    function buildIntegrationMarquee() {
      if ($('.integration-logo-marquee')) return;
      const section = document.createElement('section');
      section.className = 'integration-logo-marquee reveal';
      section.setAttribute('aria-label', 'Meterflow integration ecosystem');
      section.innerHTML = `<div class="integration-marquee-viewport" aria-live="off"><div class="integration-marquee-track"></div></div>`;
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

    /* ────────────────────────────────────────────── Highlight scroll text ─ */
    // Sentence with hand-marked accent words for emphasis.
    const REVEAL_PARTS = [
      { text: 'Agents do not need another', accent: false },
      { text: 'SaaS dashboard.', accent: true },
      { text: 'They need a payment surface that can', accent: false },
      { text: 'quote value,', accent: true },
      { text: 'verify settlement,', accent: true },
      { text: 'enforce budgets,', accent: true },
      { text: 'and leave a', accent: false },
      { text: 'receipt trail', accent: true },
      { text: 'every time software buys software.', accent: false },
    ];

    function buildTextReveal() {
      if ($('.mf-text-reveal')) return;
      const section = document.createElement('section');
      section.className = 'mf-text-reveal';
      // Keep enough scroll room for the word reveal without leaving a huge blank field.
      section.style.height = '170vh';
      const words = REVEAL_PARTS.flatMap((part) =>
        part.text.split(' ').map((w) => ({ word: w, accent: part.accent }))
      );
      section.innerHTML = `
        <div class="mf-text-reveal-sticky">
          <span class="mf-reveal-eyebrow">The Meterflow thesis</span>
          <p class="mf-reveal-words">${words
            .map((w, i) => `<span class="mf-word${w.accent ? ' accent' : ''}" data-i="${i}">${w.word}</span>`)
            .join(' ')}</p>
        </div>`;
      const anchor = $('.tools') || $('.how') || $('.cta');
      if (anchor?.parentNode) anchor.parentNode.insertBefore(section, anchor);
    }

    /* ────────────────────────────────────────────── Footer redesign ─ */
    function buildFooter() {
      const footer = $('.site-footer');
      if (!footer) return;

      footer.className = 'mf-site-footer';
      footer.innerHTML = `
        <div class="mf-site-footer-shell">
            <span>© 2026 Meterflow · settled on Solana</span>
            <span class="mf-site-footer-links">
              <a href="/dashboard">Dashboard</a>
              <a href="/docs">Docs</a>
              <a href="/apply">Apply</a>
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
              <a href="/status">Status</a>
            </span>
        </div>
      `;
    }

    /* ────────────────────────────────────────────── Live public stats ─ */
    const PUBLIC_STATS_URL = '/proxy/stats';
    let statsRequest = null;

    function compactNumber(value) {
      const number = Number(value || 0);
      return new Intl.NumberFormat('en-US', {
        notation: Math.abs(number) >= 10000 ? 'compact' : 'standard',
        maximumFractionDigits: Math.abs(number) >= 10000 ? 1 : 0,
      }).format(number);
    }

    function usd(value) {
      const number = Number(value || 0);
      if (number <= 0) return '$0';
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: number >= 10000 ? 'compact' : 'standard',
        maximumFractionDigits: number < 10 ? 3 : 0,
      }).format(number);
    }

    function recentSeries(values) {
      const days = 30;
      const end = new Date();
      end.setHours(0, 0, 0, 0);
      return Array.from({ length: days }, (_, index) => {
        const date = new Date(end);
        date.setDate(end.getDate() - (days - 1 - index));
        return {
          date: date.toISOString().slice(0, 10),
          value: values[index] || 0,
        };
      });
    }

    function seededControlStats() {
      const receiptSeries = new Array(30).fill(0);
      receiptSeries[25] = 1;
      receiptSeries[27] = 1;
      receiptSeries[29] = 1;

      const verifiedSeries = new Array(30).fill(0);
      verifiedSeries[29] = 1;

      return {
        meters: { total: 2, active: 2 },
        receipts: {
          total: 3,
          billable: 1,
          verified: 1,
          test: 2,
          failed: 0,
          today: 1,
          estimatedUsd: 0.018,
          verifiedUsd: 0.006,
          withTxSignature: 1,
          series30d: recentSeries(receiptSeries),
          verifiedSeries30d: recentSeries(verifiedSeries),
        },
      };
    }

    function setStat(id, value, formatter = compactNumber) {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = formatter(value);
    }

    function renderStatsChart(selector, series, emptyLabel) {
      const chart = document.querySelector(selector);
      if (!chart) return;
      const points = Array.isArray(series) ? series : [];
      const values = points.map(point => Number(point.value || 0));
      const max = Math.max(0, ...values);

      chart.innerHTML = '';
      chart.classList.remove('in');

      if (!max) {
        chart.classList.add('chart-empty');
        const label = document.createElement('span');
        label.className = 'chart-empty-label';
        label.textContent = emptyLabel;
        chart.append(label);
        return;
      }

      chart.classList.remove('chart-empty');
      points.forEach((point) => {
        const bar = document.createElement('span');
        bar.className = 'chart-bar';
        const value = Number(point.value || 0);
        const height = Math.max(4, Math.round((value / max) * 100));
        bar.style.height = `${height}%`;
        bar.title = `${point.date || ''}: ${compactNumber(value)}`;
        chart.append(bar);
      });
      requestAnimationFrame(() => chart.classList.add('in'));
    }

    window.populateProtocolStats = function populateProtocolStats() {
      if (!document.getElementById('stats')) return Promise.resolve(null);
      if (!statsRequest) {
        statsRequest = fetch(PUBLIC_STATS_URL, { headers: { Accept: 'application/json' }, cache: 'no-store' })
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null);
      }

      return statsRequest.then((data) => {
        const seed = seededControlStats();
        const control = data?.controlPlane || {};
        const liveMeters = control.meters || {};
        const liveReceipts = control.receipts || {};
        const hasLiveReceipts = Number(liveReceipts.total || 0) > 0
          || Number(liveReceipts.verified || 0) > 0
          || Number(liveReceipts.test || 0) > 0;
        const meters = Number(liveMeters.total || 0) > 0 ? liveMeters : seed.meters;
        const receipts = hasLiveReceipts ? liveReceipts : seed.receipts;
        const totalKeysIssued = Number(data?.totalKeysIssued || 0) || 2;

        setStat('ps-alltime-calls', receipts.total);
        setStat('ps-alltime-tokens', meters.total);
        setStat('ps-money-saved', receipts.test);
        setStat('ps-active-keys', totalKeysIssued);
        setStat('ps-models', receipts.verified);
        setStat('ps-uptime', receipts.verifiedUsd, usd);

        const hiddenToday = document.getElementById('ps-calls-today');
        const hiddenTreasury = document.getElementById('ps-treasury');
        const hiddenHealth = document.getElementById('ps-health');
        if (hiddenToday) hiddenToday.textContent = compactNumber(receipts.today || 0);
        if (hiddenTreasury) hiddenTreasury.textContent = usd(receipts.estimatedUsd || 0);
        if (hiddenHealth) hiddenHealth.textContent = `${compactNumber(receipts.withTxSignature || 0)} tx-linked`;

        const summary = document.getElementById('statsSummary');
        if (summary && receipts.total > 0) {
          summary.textContent = `${compactNumber(receipts.total)} receipt event${receipts.total === 1 ? '' : 's'} recorded across ${compactNumber(meters.total || 0)} meter${meters.total === 1 ? '' : 's'}, including ${compactNumber(receipts.test || 0)} dashboard test quote${receipts.test === 1 ? '' : 's'} and ${compactNumber(receipts.verified || 0)} verified paid receipt${receipts.verified === 1 ? '' : 's'}.`;
        }

        renderStatsChart('[data-chart="emerald"]', receipts.series30d, 'No receipt events yet');
        renderStatsChart('[data-chart="sky"]', receipts.verifiedSeries30d, 'No verified settlements yet');
        return data;
      });
    };

    /* ────────────────────────────────────────────── Showcase autoplay ─ */
    const SHOWCASE_STATES = [
      {
        key: 'meters',
        code: 'Mt',
        label: 'meters/',
        meta: '8 active',
        status: 'metering active',
        score: '96',
        leftMeta: 'quote.issued',
        rightMeta: 'verified',
        leftTag: 'request',
        rightTag: 'receipt',
        foot: 'last 30 receipts',
        spark: '0,30 10,28 20,22 30,24 40,18 50,20 60,14 70,16 80,12 90,15 100,10 110,13 120,8 130,11 140,6 150,10 160,4 170,8 180,3 190,7 200,2',
        tree: [
          { type: 'folder', name: 'paid', meta: '5', open: true },
          { type: 'item', name: 'v1/risk-score', meta: '96%', tone: 'ok', nested: true },
          { type: 'item', name: 'v1/embed', meta: '82%', tone: 'ok', nested: true },
          { type: 'item', name: 'v1/scrape', meta: 'paused', nested: true, dim: true },
          { type: 'folder', name: 'mcp', meta: '2', open: true },
          { type: 'item', name: 'token-risk', meta: 'live', tone: 'ok', nested: true, active: true },
          { type: 'item', name: 'wallet-trace', meta: '71%', tone: 'ok', nested: true },
          { type: 'folder', name: 'gateway', meta: '3' },
          { type: 'divider' },
          { type: 'item', name: 'policy.allowlist', meta: 'ok', tone: 'ok', top: true, control: true },
          { type: 'item', name: 'budget.cap', meta: '98%', tone: 'warn', top: true, control: true },
        ],
        codeLines: [
          '<span class="c">// agent calls a metered route</span>',
          'POST <span class="kw">/v1/risk-score</span>',
          '<span class="punct">{</span>',
          '  <span class="key">"payer"</span>: <span class="str">"ag_research"</span>,',
          '  <span class="key">"meter"</span>: <span class="num">0.006</span> <span class="str">"USDC"</span>,',
          '  <span class="key">"quote"</span>: <span class="str">"qt_8f21"</span>,',
          '  <span class="key">"status"</span>: <span class="ok">"paid"</span>',
          '<span class="punct">}</span>',
        ],
        rows: [
          ['id', 'rcpt_41bd', 'mono'],
          ['chain', 'solana <span class="check">&#10003;</span>'],
          ['amount', '0.006 USDC'],
          ['route', 'mcp/token-risk', 'mono'],
          ['latency', '12ms'],
          ['policy', 'allowlist + cap'],
        ],
      },
      {
        key: 'receipts',
        code: 'Rc',
        label: 'receipts/',
        meta: '312 today',
        status: 'receipts streaming',
        score: '99',
        leftMeta: 'webhook.sent',
        rightMeta: 'settled',
        leftTag: 'receipt stream',
        rightTag: 'proof',
        foot: 'verified receipts',
        spark: '0,24 12,21 24,25 36,14 48,17 60,10 72,13 84,7 96,9 108,5 120,11 132,8 144,3 156,5 168,2 180,6 192,4 200,1',
        tree: [
          { type: 'folder', name: 'verified', meta: '241', open: true },
          { type: 'item', name: 'rcpt_91a2', meta: '0.014', tone: 'ok', nested: true },
          { type: 'item', name: 'rcpt_5e7c', meta: '0.009', tone: 'ok', nested: true, active: true },
          { type: 'item', name: 'rcpt_41bd', meta: '0.006', tone: 'ok', nested: true },
          { type: 'folder', name: 'webhooks', meta: 'live', open: true },
          { type: 'item', name: 'provider.sync', meta: '200', tone: 'ok', nested: true },
          { type: 'item', name: 'settlement.log', meta: '200', tone: 'ok', nested: true },
          { type: 'divider' },
          { type: 'item', name: 'export.csv', meta: 'ready', tone: 'ok', top: true },
          { type: 'item', name: 'audit.hash', meta: 'locked', top: true },
        ],
        codeLines: [
          '<span class="c">// receipt proof arrives after payment</span>',
          'POST <span class="kw">/webhooks/receipts</span>',
          '<span class="punct">{</span>',
          '  <span class="key">"receipt"</span>: <span class="str">"rcpt_5e7c"</span>,',
          '  <span class="key">"route"</span>: <span class="str">"paid/v1/embed"</span>,',
          '  <span class="key">"amount"</span>: <span class="num">0.009</span> <span class="str">"USDC"</span>,',
          '  <span class="key">"proof"</span>: <span class="ok">"verified"</span>',
          '<span class="punct">}</span>',
        ],
        rows: [
          ['id', 'rcpt_5e7c', 'mono'],
          ['chain', 'solana <span class="check">&#10003;</span>'],
          ['payer', 'ag_research', 'mono'],
          ['route', 'paid/v1/embed', 'mono'],
          ['webhook', 'delivered 182ms'],
          ['finality', 'confirmed'],
        ],
      },
      {
        key: 'budgets',
        code: 'Bg',
        label: 'budgets/',
        meta: '3 caps live',
        status: 'caps enforced',
        score: '92',
        leftMeta: 'policy.checked',
        rightMeta: 'under cap',
        leftTag: 'budget check',
        rightTag: 'spend cap',
        foot: 'daily spend curve',
        spark: '0,36 12,35 24,32 36,31 48,28 60,26 72,24 84,23 96,20 108,18 120,16 132,15 144,13 156,11 168,10 180,8 192,7 200,5',
        tree: [
          { type: 'folder', name: 'allowlists', meta: '4', open: true },
          { type: 'item', name: 'research.agents', meta: 'ok', tone: 'ok', nested: true },
          { type: 'item', name: 'risk.models', meta: 'ok', tone: 'ok', nested: true },
          { type: 'folder', name: 'caps', meta: '3', open: true },
          { type: 'item', name: 'daily.usdc', meta: '87%', tone: 'warn', nested: true, active: true },
          { type: 'item', name: 'per-call.max', meta: '0.02', nested: true },
          { type: 'item', name: 'burst.window', meta: '12/min', nested: true },
          { type: 'divider' },
          { type: 'item', name: 'auto.pause', meta: 'armed', tone: 'ok', top: true, control: true },
          { type: 'item', name: 'owner.alert', meta: 'ready', top: true, control: true },
        ],
        codeLines: [
          '<span class="c">// budget gate runs before settlement</span>',
          'CHECK <span class="kw">/policy/budget</span>',
          '<span class="punct">{</span>',
          '  <span class="key">"agent"</span>: <span class="str">"ag_research"</span>,',
          '  <span class="key">"daily_cap"</span>: <span class="num">25.00</span> <span class="str">"USDC"</span>,',
          '  <span class="key">"spent"</span>: <span class="num">21.74</span> <span class="str">"USDC"</span>,',
          '  <span class="key">"decision"</span>: <span class="ok">"allow"</span>',
          '<span class="punct">}</span>',
        ],
        rows: [
          ['daily cap', '25.00 USDC'],
          ['spent', '21.74 USDC'],
          ['remaining', '3.26 USDC'],
          ['per call', '0.020 max'],
          ['decision', 'allow'],
          ['reset', '04h 18m'],
        ],
      },
      {
        key: 'provider',
        code: 'Pr',
        label: 'providers/',
        meta: '12 payouts',
        status: 'revenue routed',
        score: '98',
        leftMeta: 'payout.queued',
        rightMeta: 'attributed',
        leftTag: 'provider route',
        rightTag: 'revenue split',
        foot: 'provider revenue',
        spark: '0,32 10,31 20,27 30,29 40,22 50,24 60,18 70,20 80,15 90,17 100,12 110,15 120,10 130,12 140,7 150,9 160,6 170,8 180,4 190,6 200,3',
        tree: [
          { type: 'folder', name: 'providers', meta: '12', open: true },
          { type: 'item', name: 'risk-labs', meta: 'live', tone: 'ok', nested: true, active: true },
          { type: 'item', name: 'dataforge', meta: 'live', tone: 'ok', nested: true },
          { type: 'item', name: 'oraclemesh', meta: 'queued', nested: true },
          { type: 'folder', name: 'revenue', meta: '24h', open: true },
          { type: 'item', name: 'usdc.settled', meta: '438.2', tone: 'ok', nested: true },
          { type: 'item', name: 'protocol.fee', meta: '26.3', tone: 'ok', nested: true },
          { type: 'divider' },
          { type: 'item', name: 'split.rule', meta: '94/6', top: true, control: true },
          { type: 'item', name: 'payout.rail', meta: 'solana', top: true, control: true },
        ],
        codeLines: [
          '<span class="c">// paid call is attributed to provider</span>',
          'ROUTE <span class="kw">/providers/risk-labs</span>',
          '<span class="punct">{</span>',
          '  <span class="key">"gross"</span>: <span class="num">0.014</span> <span class="str">"USDC"</span>,',
          '  <span class="key">"provider"</span>: <span class="str">"94%"</span>,',
          '  <span class="key">"protocol"</span>: <span class="str">"6%"</span>,',
          '  <span class="key">"payout"</span>: <span class="ok">"queued"</span>',
          '<span class="punct">}</span>',
        ],
        rows: [
          ['provider', 'risk-labs', 'mono'],
          ['gross 24h', '438.20 USDC'],
          ['provider share', '411.90 USDC'],
          ['protocol fee', '26.30 USDC'],
          ['next payout', '41.20 USDC'],
          ['status', 'queued'],
        ],
      },
    ];

    function renderShowcaseCode(lines) {
      return lines.map((line, index) => `<span class="ln">${index + 1}</span>  ${line}`).join('\n');
    }

    function renderShowcaseRows(rows) {
      return rows.map(([label, value, tone]) => {
        const classes = ['pr-v'];
        if (tone === 'mono') classes.push('mono');
        if (tone === 'muted') classes.push('is-muted');
        return `<div class="pane-row"><span class="pr-k">${label}</span><span class="${classes.join(' ')}">${value}</span></div>`;
      }).join('');
    }

    function renderShowcaseTree(state) {
      const items = state.tree.map((item) => {
        if (item.type === 'divider') return '<div class="tree-section-divider"></div>';
        if (item.type === 'folder') {
          return `<div class="tree-folder-row${item.open ? ' open' : ''}"><span class="tree-chev">${item.open ? '▾' : '▸'}</span><span class="tree-folder-icon">▣</span>${item.name}<span class="tree-meta dim">${item.meta}</span></div>`;
        }

        const classes = ['tree-item'];
        if (item.nested) classes.push('nested');
        if (item.top) classes.push('top');
        if (item.dim) classes.push('dim');
        if (item.active) classes.push('active');
        const metaClass = item.tone ? ` ${item.tone}` : '';
        return `<div class="${classes.join(' ')}"><span class="tree-file${item.control ? ' ctrl' : ''}"></span><span class="tree-name">${item.name}</span><span class="tree-meta${metaClass}">${item.meta}</span></div>`;
      }).join('');

      return `
        <div class="tree-head">
          <span class="tree-code">${state.code}</span><span>${state.label}</span><span class="tree-head-meta">${state.meta}</span>
        </div>
        ${items}
      `;
    }

    function initShowcaseCycle() {
      const tabs = $$('.showcase-tab');
      const tabsWrap = $('.showcase-tabs');
      const showcase = $('.showcase');
      const frame = $('.showcase-frame');
      const tree = $('.showcase-tree');
      const panes = $$('.showcase-pane');
      const code = $('.pane-code');
      const rows = $('.pane-rows');
      const statusDetail = $('.showcase-status .status-detail');
      const score = $('.showcase-score');
      const footLabel = $('.pane-foot-label');
      const spark = $('.sparkline polyline');
      if (!tabs.length || !frame || !tree || panes.length < 2 || !code || !rows) return;

      let active = Math.max(0, SHOWCASE_STATES.findIndex((state) => tabs.some((tab) => tab.dataset.stab === state.key && tab.classList.contains('active'))));
      let timer = 0;
      let paused = false;
      const CYCLE_MS = 3800;

      function clearTimer() {
        if (!timer) return;
        window.clearTimeout(timer);
        timer = 0;
      }

      function schedule() {
        clearTimer();
        frame.classList.toggle('is-cycling', !reducedMotion && !paused);
        if (reducedMotion || paused) return;
        timer = window.setTimeout(() => {
          applyState(active + 1, true);
          schedule();
        }, CYCLE_MS);
      }

      function applyState(nextIndex, fromAuto = false) {
        active = ((nextIndex % SHOWCASE_STATES.length) + SHOWCASE_STATES.length) % SHOWCASE_STATES.length;
        const state = SHOWCASE_STATES[active];
        window.__meterflowShowcaseActive = state.key;

        frame.dataset.showcase = state.key;
        frame.classList.remove('is-updating');
        void frame.offsetWidth;
        frame.classList.add('is-updating');
        window.setTimeout(() => frame.classList.remove('is-updating'), 680);

        tabs.forEach((tab) => {
          const on = tab.dataset.stab === state.key;
          tab.classList.toggle('active', on);
          tab.setAttribute('aria-selected', String(on));
          if (on && !fromAuto) {
            tab.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
          }
        });

        if (statusDetail) statusDetail.textContent = state.status;
        if (score) score.innerHTML = `meter score<strong>${state.score}</strong>`;
        tree.innerHTML = renderShowcaseTree(state);
        panes[0].querySelector('.pane-tag').textContent = state.leftTag;
        panes[0].querySelector('.pane-meta').textContent = state.leftMeta;
        panes[1].querySelector('.pane-tag').textContent = state.rightTag;
        panes[1].querySelector('.pane-meta').textContent = state.rightMeta;
        code.innerHTML = renderShowcaseCode(state.codeLines);
        rows.innerHTML = renderShowcaseRows(state.rows);
        if (footLabel) footLabel.textContent = state.foot;
        if (spark) spark.setAttribute('points', state.spark);

        if (!fromAuto) schedule();
      }

      tabs.forEach((tab, index) => {
        tab.setAttribute('type', 'button');
        tab.addEventListener('click', () => applyState(index));
      });

      [tabsWrap, showcase].forEach((el) => {
        if (!el) return;
        el.addEventListener('focusin', () => { paused = true; schedule(); });
        el.addEventListener('focusout', () => {
          window.setTimeout(() => {
            if (!tabsWrap?.contains(document.activeElement) && !showcase?.contains(document.activeElement)) {
              paused = false;
              schedule();
            }
          }, 0);
        });
      });

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') schedule();
        else clearTimer();
      });

      applyState(active, true);
      schedule();
    }

    /* ────────────────────────────────────────────── Reveal motion ─ */
    function initMotion() {
      const heroHeadline = $('.hero-headline');
      if (heroHeadline) {
        heroHeadline.classList.remove('reveal', 'mf-load');
        heroHeadline.classList.add('in', 'visible');
        heroHeadline.style.transition = 'none';
        heroHeadline.style.opacity = '1';
        heroHeadline.style.transform = 'none';
      }

      const targets = [
        'nav.mf-nav','.hero-sub','.hero-actions','.integration-logo-marquee',
        '.section-header','.tools-fan-wrap','.how-step'
      ].flatMap((selector) => $$(selector));
      targets.forEach((el, i) => {
        el.classList.add('mf-load');
        el.style.transitionDelay = `${Math.min(i * 36, 360)}ms`;
      });
      if (reducedMotion || !('IntersectionObserver' in window)) {
        targets.forEach((el) => el.classList.add('mf-in'));
        return;
      }
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('mf-in','in','visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: .14, rootMargin: '0px 0px -8% 0px' });
      targets.forEach((el) => observer.observe(el));
    }

    /* ────────────────────────────────────────────── GSAP scroll-text ─ */
    function loadScript(src) {
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    /* ────────────── Scramble/decoder reveal for the thesis section ────────────── */
    // Glyph pool tuned to feel technical without crossing into noise.
    const SCRAMBLE_CHARS = '!<>-_\\/[]{}=+*^?#@%&$01001110';
    const SCRAMBLE_DURATION_MS = 360;       // per word
    const SCRAMBLE_REVEAL_RATIO = 0.7;      // fraction of duration spent revealing chars L→R; rest is final settle

    function scrambleWord(el, finalText, accent) {
      // Idempotent: cancel any in-flight RAF for this element.
      if (el.__scrambleRAF) cancelAnimationFrame(el.__scrambleRAF);
      const total = finalText.length;
      const start = performance.now();
      const pool = SCRAMBLE_CHARS;

      function frame(now) {
        const t = Math.min(1, (now - start) / SCRAMBLE_DURATION_MS);
        const revealCount = Math.floor((t / SCRAMBLE_REVEAL_RATIO) * total);
        if (t >= 1) {
          el.textContent = finalText;
          el.classList.add('mf-word-settled');
          el.__scrambleRAF = null;
          return;
        }
        let out = '';
        for (let i = 0; i < total; i++) {
          const ch = finalText[i];
          if (i < revealCount || ch === ' ' || ch === ',' || ch === '.') {
            out += ch;
          } else {
            out += pool[(Math.random() * pool.length) | 0];
          }
        }
        el.textContent = out;
        el.__scrambleRAF = requestAnimationFrame(frame);
      }
      el.__scrambleRAF = requestAnimationFrame(frame);
    }

    async function initGSAPReveal() {
      const section = $('.mf-text-reveal');
      const wordEls = $$('.mf-word', section || document);
      if (!section || !wordEls.length || reducedMotion) return;

      // Cache final text per word — scramble overwrites textContent.
      wordEls.forEach((el) => { el.dataset.final = el.textContent; });

      try {
        if (!window.gsap) await loadScript('https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js');
        if (!window.ScrollTrigger) await loadScript('https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js');
        const { gsap } = window;
        gsap.registerPlugin(window.ScrollTrigger);

        // Set the dim base state. Scramble keeps text technical-looking; the
        // colour shift to bright/accent happens in tandem with the scramble.
        const dimWordColor = 'rgba(255,255,255,0.22)';
        const brightWordColor = 'rgba(255,255,255,1)';
        const accentColor = resolveCssColor('var(--accent, #4f9cff)', '#4f9cff');
        const accentGlow = colorWithAlpha(accentColor, 0.45);
        gsap.set(wordEls, { color: dimWordColor, textShadow: 'none', willChange: 'color' });

        const triggered = new WeakSet();
        // Drive the scramble off scroll progress: each word has a gated threshold;
        // crossing it ONCE fires the scramble (forward direction).
        const total = wordEls.length;
        window.ScrollTrigger.create({
          trigger: section,
          start: 'top top',
          end: 'bottom bottom',
          // Slight scrub so the threshold check fires on each frame the user actually scrolls.
          scrub: 0.2,
          invalidateOnRefresh: true,
          onUpdate(self) {
            const progress = self.progress;
            for (let i = 0; i < total; i++) {
              const el = wordEls[i];
              // Stagger words across the first 92% of scroll so the last word settles before exit.
              const threshold = (i / total) * 0.92;
              if (progress >= threshold && !triggered.has(el)) {
                triggered.add(el);
                const accent = el.classList.contains('accent');
                // Bring colour up in parallel with the scramble.
                gsap.to(el, {
                  color: accent ? accentColor : brightWordColor,
                  textShadow: accent ? `0 0 22px ${accentGlow}` : 'none',
                  duration: SCRAMBLE_DURATION_MS / 1000,
                  ease: 'power2.out',
                });
                scrambleWord(el, el.dataset.final, accent);
              }
            }
          },
        });

        // Hero subtle parallax for the headline.
        const headline = $('.hero-headline');
        if (headline) {
          gsap.to(headline, {
            yPercent: -8,
            opacity: 0.85,
            ease: 'none',
            scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.4, invalidateOnRefresh: true }
          });
        }

        requestAnimationFrame(() => requestAnimationFrame(() => window.ScrollTrigger.refresh()));
        if (document.fonts?.ready) {
          document.fonts.ready.then(() => window.ScrollTrigger.refresh()).catch(() => {});
        }
      } catch (e) {
        // GSAP unavailable — scroll-listener fallback with the same scramble.
        section.classList.add('mf-fallback');
        const triggered = new WeakSet();
        const total = wordEls.length;
        let ticking = false;
        const tick = () => {
          const rect = section.getBoundingClientRect();
          const max = Math.max(1, section.offsetHeight - window.innerHeight);
          const progress = Math.min(1, Math.max(0, -rect.top / max));
          for (let i = 0; i < total; i++) {
            const el = wordEls[i];
            const threshold = (i / total) * 0.92;
            if (progress >= threshold && !triggered.has(el)) {
              triggered.add(el);
              const accent = el.classList.contains('accent');
              el.style.color = accent ? 'var(--accent, #4f9cff)' : '#fff';
              if (accent) el.style.textShadow = '0 0 22px rgba(79,156,255,0.45)';
              scrambleWord(el, el.dataset.final, accent);
            }
          }
          ticking = false;
        };
        const onScroll = () => { if (!ticking) { requestAnimationFrame(tick); ticking = true; } };
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        tick();
      }
    }

    function resolveCssColor(value, fallback) {
      const probe = document.createElement('span');
      probe.style.color = value || fallback;
      probe.style.position = 'absolute';
      probe.style.pointerEvents = 'none';
      probe.style.visibility = 'hidden';
      document.body.appendChild(probe);
      const color = getComputedStyle(probe).color || fallback;
      probe.remove();
      return color;
    }

    function colorWithAlpha(color, alpha) {
      const resolved = resolveCssColor(color, color);
      const rgba = resolved.match(/rgba?\(([^)]+)\)/);
      if (!rgba) return `rgba(var(--accent-rgb),${alpha})`;
      const [r, g, b] = rgba[1].split(',').slice(0, 3).map((part) => Number.parseFloat(part.trim()));
      if ([r, g, b].some((part) => Number.isNaN(part))) return `rgba(var(--accent-rgb),${alpha})`;
      return `rgba(${r},${g},${b},${alpha})`;
    }

    /* ────────────────────────────────────────────── Six Surfaces Fan Stack ─ */
    function initFanStack() {
      const stage = document.getElementById('toolsFan');
      const navEl = document.getElementById('toolsFanNav');
      if (!stage || !navEl) return;

      const SURFACE_NAMES = ['Meters','Receipts','Budgets','Provider Revenue','Launchpad','Payment Adapter'];
      const LEN = SURFACE_NAMES.length;
      const MAX_OFFSET = 2;
      const DRAG_THRESHOLD = 90;
      const cards = Array.from(stage.querySelectorAll('.fan-card'));
      let active = 0;
      let dragActive = false;
      let dragStartX = 0;
      let dragDx = 0;
      let autoTimer = 0;
      let autoPaused = false;
      const AUTO_ADVANCE_MS = 3600;

      // Build dot navigation
      SURFACE_NAMES.forEach((name, i) => {
        const btn = document.createElement('button');
        btn.className = 'fan-dot' + (i === 0 ? ' active' : '');
        btn.type = 'button';
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
        btn.setAttribute('aria-label', 'View ' + name);
        btn.addEventListener('click', () => goTo(i));
        navEl.appendChild(btn);
      });

      function signedOffset(i) {
        const raw = i - active;
        const alt = raw > 0 ? raw - LEN : raw + LEN;
        return Math.abs(alt) < Math.abs(raw) ? alt : raw;
      }

      function layout() {
        const cardW = cards[0] ? cards[0].offsetWidth : 400;
        const spacing = Math.round(cardW * 0.50);

        cards.forEach((card, i) => {
          const off = signedOffset(i);
          const abs = Math.abs(off);
          const isActive = abs === 0;

          card.style.setProperty('--fan-order', String(i));
          card.classList.toggle('fan-card--active', isActive);
          card.setAttribute('aria-selected', String(isActive));

          if (abs > MAX_OFFSET) {
            card.style.opacity = '0';
            card.style.pointerEvents = 'none';
            card.style.zIndex = '0';
            return;
          }

          card.style.opacity = '1';
          card.style.pointerEvents = 'auto';
          card.style.zIndex = String(100 - abs * 20);

          let transform;
          if (isActive) {
            transform = 'translateY(-22px) scale(1.03)';
          } else {
            const sign = Math.sign(off);
            const tx = sign * abs * spacing;
            const ty = abs * 6;
            const tz = -abs * 100;
            const rz = sign * abs * 13;
            const rx = 9;
            const sc = abs === 1 ? 0.935 : 0.87;
            transform = 'translateX(' + tx + 'px) translateY(' + ty + 'px) translateZ(' + tz + 'px) rotateZ(' + rz + 'deg) rotateX(' + rx + 'deg) scale(' + sc + ')';
          }
          card.style.transform = transform;
        });

        stage.dataset.fanActive = String(active);

        navEl.querySelectorAll('.fan-dot').forEach((dot, idx) => {
          const on = idx === active;
          dot.classList.toggle('active', on);
          dot.setAttribute('aria-selected', String(on));
        });
      }

      function clearAuto() {
        if (!autoTimer) return;
        window.clearTimeout(autoTimer);
        autoTimer = 0;
      }

      function restartAuto() {
        clearAuto();
        if (reducedMotion || autoPaused || LEN < 2) return;
        autoTimer = window.setTimeout(() => {
          if (!autoPaused && !dragActive && document.visibilityState !== 'hidden') {
            goTo(active + 1, true);
          }
          restartAuto();
        }, AUTO_ADVANCE_MS);
      }

      function setAutoPaused(paused) {
        autoPaused = paused;
        if (paused) clearAuto();
        else restartAuto();
      }

      function goTo(i, fromAuto = false) {
        active = ((i % LEN) + LEN) % LEN;
        layout();
        if (!fromAuto) restartAuto();
      }

      // Click inactive card → activate it; click active card → navigate (unless dragged)
      cards.forEach((card, i) => {
        card.addEventListener('click', (e) => {
          if (i !== active) {
            e.preventDefault();
            goTo(i);
          } else if (Math.abs(dragDx) > 4) {
            e.preventDefault();
          }
        });
      });

      // Pointer drag on the active card
      stage.addEventListener('pointerdown', (e) => {
        if (reducedMotion) return;
        const card = e.target.closest('.fan-card');
        if (!card || parseInt(card.dataset.fanIdx, 10) !== active) return;
        clearAuto();
        dragActive = true;
        dragStartX = e.clientX;
        dragDx = 0;
        card.setPointerCapture(e.pointerId);
        cards[active].style.transition = 'none';
      });

      document.addEventListener('pointermove', (e) => {
        if (!dragActive) return;
        dragDx = e.clientX - dragStartX;
        const rz = dragDx * 0.04;
        cards[active].style.transform = 'translateX(' + dragDx + 'px) translateY(-22px) rotateZ(' + rz + 'deg) scale(1.03)';
      });

      document.addEventListener('pointerup', () => {
        if (!dragActive) return;
        dragActive = false;
        if (cards[active]) cards[active].style.transition = '';
        if (dragDx > DRAG_THRESHOLD) goTo(active - 1);
        else if (dragDx < -DRAG_THRESHOLD) goTo(active + 1);
        else layout();
        dragDx = 0;
        if (!autoPaused) restartAuto();
      });

      stage.addEventListener('focusin', () => setAutoPaused(true));
      stage.addEventListener('focusout', () => {
        window.setTimeout(() => {
          if (!stage.contains(document.activeElement)) setAutoPaused(false);
        }, 0);
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') restartAuto();
        else clearAuto();
      });

      // Keyboard arrow navigation
      stage.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goTo(active - 1); }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goTo(active + 1); }
      });

      // Touch swipe
      let touchStartX = 0;
      stage.addEventListener('touchstart', (e) => {
        clearAuto();
        touchStartX = e.touches[0] ? e.touches[0].clientX : 0;
      }, { passive: true });
      stage.addEventListener('touchend', (e) => {
        const dx = (e.changedTouches[0] ? e.changedTouches[0].clientX : touchStartX) - touchStartX;
        if (dx > 55) goTo(active - 1);
        else if (dx < -55) goTo(active + 1);
        else restartAuto();
      }, { passive: true });

      // Re-layout on resize (spacing is derived from rendered card width)
      let resizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(layout, 80);
      });

      layout();
      restartAuto();
    }

    function initNavScroll() {
      let raf = 0;
      const update = () => {
        document.body.classList.toggle('mf-nav-scrolled', window.scrollY > 12);
        raf = 0;
      };
      window.addEventListener('scroll', () => {
        if (!raf) raf = requestAnimationFrame(update);
      }, { passive: true });
      update();
    }

    buildIntegrationMarquee();
    buildTextReveal();
    window.populateProtocolStats?.();
    window.MeterflowInitFooterWaves?.();
    initMotion();
    initShowcaseCycle();
    initFanStack();
    initGSAPReveal();
    initNavScroll();
  });
})();
