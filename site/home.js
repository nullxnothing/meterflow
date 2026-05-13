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
      #mobileMenu.mobile-menu.open,body.mobile-menu-open #mobileMenu.mobile-menu{display:flex!important;position:fixed!important;top:60px!important;left:0!important;right:0!important;z-index:10000!important;max-height:calc(100vh - 60px);overflow-y:auto;background:rgba(6,7,10,.98)!important;border-bottom:1px solid rgba(255,255,255,.08)!important;box-shadow:0 30px 80px rgba(0,0,0,.48)}

      /* ─── Minimal zauth-style nav: transparent, thin, no chrome ─── */
      body > nav.mf-nav{padding:18px clamp(20px,3.4vw,40px)!important;display:flex;align-items:center;gap:18px;justify-content:space-between;background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;border-bottom:0!important;box-shadow:none!important;position:absolute;top:0;left:0;right:0;z-index:50}
      body.mf-nav-scrolled > nav.mf-nav{position:fixed;background:rgba(8,9,12,.6)!important;backdrop-filter:saturate(140%) blur(14px);-webkit-backdrop-filter:saturate(140%) blur(14px);border-bottom:1px solid rgba(255,255,255,.04)!important;transition:background .25s ease,border-color .25s ease}
      body > nav.mf-nav .nav-logo{font-family:var(--font-serif,Georgia,'Times New Roman',serif);font-style:italic;font-size:18px;letter-spacing:-.01em;font-weight:500;color:rgba(225,228,236,.72);display:inline-flex;align-items:center;gap:8px;text-decoration:none;transition:color .2s ease}
      body > nav.mf-nav .nav-logo:hover{color:#fff}
      body > nav.mf-nav .nav-logo .brand-mark{width:18px;height:18px;display:block;opacity:.7;filter:none}
      body > nav.mf-nav .nav-links{display:flex;align-items:center;gap:2px;justify-content:center;flex:1;padding:0 12px}
      body > nav.mf-nav .nav-links a{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:8px;font-size:13px;line-height:1;font-weight:400;color:rgba(225,228,236,.62);text-decoration:none;transition:color .18s ease,background .18s ease}
      body > nav.mf-nav .nav-links a::after{display:none!important}
      body > nav.mf-nav .nav-links a:hover{color:#fff;background:rgba(255,255,255,.035)}
      body > nav.mf-nav .nav-links a.active{color:#fff;background:rgba(255,255,255,.05)}
      body > nav.mf-nav .nav-glyph{display:inline-flex;width:18px;height:18px;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:9.5px;font-weight:500;letter-spacing:.01em;color:rgba(225,228,236,.5);background:transparent;border-radius:0;border:0}
      body > nav.mf-nav .nav-links a:hover .nav-glyph,body > nav.mf-nav .nav-links a.active .nav-glyph{color:rgba(255,255,255,.85)}
      body > nav.mf-nav .nav-actions{display:flex;align-items:center;gap:10px}
      body > nav.mf-nav .nav-socials{display:inline-flex;align-items:center;gap:2px}
      body > nav.mf-nav .nav-social{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;color:rgba(225,228,236,.5);transition:color .18s ease,background .18s ease}
      body > nav.mf-nav .nav-social:hover{color:#fff;background:rgba(255,255,255,.04)}
      body > nav.mf-nav .nav-social svg{width:14px;height:14px}

      /* ─── Tiny zauth-style "Log in" button ─── */
      .mf-login{display:inline-flex;align-items:center;gap:7px;padding:7px 13px 7px 11px;border-radius:8px;font-family:var(--font-sans),system-ui,sans-serif;font-size:13px;font-weight:500;letter-spacing:-.003em;color:rgba(225,228,236,.78);text-decoration:none;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);transition:color .18s ease,background .18s ease,border-color .18s ease}
      .mf-login:hover{color:#fff;background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.14)}
      .mf-login-wallet{width:14px;height:14px;opacity:.7;display:block}
      .mf-login:hover .mf-login-wallet{opacity:1}

      /* Hero needs top padding now that the nav is absolutely positioned */
      section.hero{padding-top:clamp(120px,14vh,170px)!important}

      @media(max-width:980px){body > nav.mf-nav .nav-links{display:none!important}body > nav.mf-nav .nav-socials{display:none!important}}
      @media(max-width:560px){.mf-login{padding:6px 10px 6px 10px;font-size:12.5px}}

      /* ─── Section polish ─── */
      .hero-headline,.section-title,.cta-title{letter-spacing:-.035em}
      .hero-sub,.section-sub{color:rgba(225,228,236,.62)!important}
      .mf-load{opacity:0;transform:translateY(18px);filter:blur(6px);transition:opacity .9s cubic-bezier(.2,.65,.3,1),transform .9s cubic-bezier(.2,.65,.3,1),filter .9s cubic-bezier(.2,.65,.3,1);will-change:transform,opacity,filter}
      .mf-load.mf-in{opacity:1;transform:none;filter:blur(0)}

      /* ─── Integration marquee ─── */
      .integration-logo-marquee{position:relative;overflow:hidden;padding:46px 0 56px;border-top:1px solid rgba(255,255,255,.045);border-bottom:1px solid rgba(255,255,255,.045);background:radial-gradient(circle at 50% 0%,rgba(59,130,246,.08),transparent 42%),linear-gradient(180deg,rgba(255,255,255,.018),rgba(255,255,255,.006))}
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
      .mf-reveal-eyebrow{font-family:var(--font-mono);text-transform:uppercase;letter-spacing:.22em;font-size:11px;color:var(--accent,#3b82f6);margin-bottom:28px;display:inline-flex;align-items:center;gap:10px}
      .mf-reveal-eyebrow::before{content:'';width:24px;height:1px;background:currentColor;opacity:.6}
      .mf-reveal-words{max-width:1040px;margin:0;font-family:var(--font-display);font-size:clamp(28px,4.6vw,60px);line-height:1.14;font-weight:600;letter-spacing:-.035em;color:rgba(255,255,255,.14)}
      .mf-word{display:inline-block;margin:.02em .14em .02em 0;color:rgba(255,255,255,.14);transition:color .12s linear}
      .mf-word.lit{color:#fff}
      .mf-word.accent.lit{color:var(--accent,#3b82f6);text-shadow:0 0 22px rgba(59,130,246,.45)}
      .mf-word em{font-family:var(--font-serif);font-style:italic;font-weight:400}

      /* ─── Six-surfaces footer (zauth-inspired) ─── */
      .zauth-footer-cta,.mf-six-footer{position:relative;overflow:hidden}
      .zauth-footer-cta{padding:clamp(82px,10vw,128px) 24px 72px;background:linear-gradient(180deg,#08090b 0%,#0a0b0e 100%)}
      .zauth-footer-cta-card{position:relative;z-index:2;max-width:1100px;margin:0 auto;padding:clamp(34px,5.4vw,68px);border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,.005)),#0d0e12;border:1px solid rgba(255,255,255,.07);box-shadow:0 40px 80px -30px rgba(0,0,0,.5)}
      .zauth-footer-cta-card h2{margin:0;color:#fff;font-family:var(--font-display);font-size:clamp(34px,4.6vw,60px);line-height:1.02;font-weight:500;letter-spacing:-.03em}
      .zauth-footer-cta-card h2 em{font-family:var(--font-serif);font-style:italic;font-weight:400;color:#fff}
      .zauth-footer-cta-card p{max-width:760px;margin:22px 0 0;color:rgba(225,228,236,.65);font-size:clamp(15px,1.6vw,19px);line-height:1.62}
      .zauth-footer-cta-actions{display:flex;gap:14px;flex-wrap:wrap;margin-top:38px}
      .zauth-footer-cta-actions a{display:inline-flex;align-items:center;gap:8px;min-height:50px;padding:0 22px;border-radius:13px;text-decoration:none;font-family:var(--font-display);font-weight:600;font-size:14.5px;letter-spacing:-.005em;transition:transform .22s cubic-bezier(.2,.65,.3,1),box-shadow .22s ease,background .22s ease}
      .zauth-footer-cta-actions a:first-child{color:#0a0b0e;background:linear-gradient(180deg,#fafbff 0%,#dfe5f3 100%);border:1px solid rgba(255,255,255,.22);box-shadow:0 0 0 1px rgba(0,0,0,.2),0 14px 32px -8px rgba(59,130,246,.5)}
      .zauth-footer-cta-actions a:first-child:hover{transform:translateY(-1px);box-shadow:0 0 0 1px rgba(0,0,0,.22),0 20px 40px -8px rgba(59,130,246,.65)}
      .zauth-footer-cta-actions a:last-child{color:rgba(255,255,255,.86);background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1)}
      .zauth-footer-cta-actions a:last-child:hover{background:rgba(255,255,255,.07);color:#fff;transform:translateY(-1px)}

      .mf-six-footer{position:relative;padding:clamp(80px,9vw,128px) 24px 56px;background:#08090b;border-top:1px solid rgba(255,255,255,.05)}
      .mf-six-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:.62;z-index:0}
      .mf-six-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:48px 48px;mask-image:radial-gradient(ellipse 70% 60% at 50% 40%,#000 30%,transparent 80%);-webkit-mask-image:radial-gradient(ellipse 70% 60% at 50% 40%,#000 30%,transparent 80%);pointer-events:none;z-index:0}
      .mf-six-shell{position:relative;z-index:2;max-width:1180px;margin:0 auto}
      .mf-six-top{display:grid;grid-template-columns:1.2fr 1fr 1fr 1fr;gap:48px 56px;align-items:start;padding-bottom:64px;border-bottom:1px solid rgba(255,255,255,.06)}
      .mf-six-brand{display:flex;flex-direction:column;gap:18px;max-width:340px}
      .mf-six-brand-mark{display:inline-flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-family:var(--font-display);font-weight:600;font-size:18px;letter-spacing:-.015em}
      .mf-six-brand-mark img{width:26px;height:26px;filter:drop-shadow(0 0 10px rgba(59,130,246,.45))}
      .mf-six-tagline{color:rgba(225,228,236,.56);font-size:14px;line-height:1.6;margin:0}
      .mf-six-status{display:inline-flex;align-items:center;gap:8px;font-family:var(--font-mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(225,228,236,.6);padding:6px 11px;border-radius:999px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);width:max-content}
      .mf-six-status-dot{width:7px;height:7px;border-radius:999px;background:#22c55e;box-shadow:0 0 10px #22c55e;animation:mfStatusPulse 2.2s ease-in-out infinite}
      @keyframes mfStatusPulse{0%,100%{opacity:.85;transform:scale(1)}50%{opacity:1;transform:scale(1.15)}}
      .mf-six-col h3{margin:0 0 18px;font-family:var(--font-mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:rgba(225,228,236,.42);font-weight:500}
      .mf-six-col ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:11px}
      .mf-six-col a{color:rgba(225,228,236,.78);text-decoration:none;font-size:14.5px;letter-spacing:-.005em;transition:color .18s ease;display:inline-flex;align-items:center;gap:8px}
      .mf-six-col a:hover{color:#fff}
      .mf-six-col a .ext{opacity:.4;font-size:10px;font-family:var(--font-mono)}

      /* The six surfaces strip */
      .mf-six-surfaces{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin:44px 0 36px}
      .mf-surface{position:relative;padding:18px 16px;border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));border:1px solid rgba(255,255,255,.07);overflow:hidden;transition:transform .35s cubic-bezier(.2,.65,.3,1),border-color .35s ease,background .35s ease}
      .mf-surface::before{content:'';position:absolute;inset:0;background:radial-gradient(120% 80% at 50% 0%,rgba(59,130,246,.18),transparent 60%);opacity:0;transition:opacity .35s ease}
      .mf-surface:hover{transform:translateY(-3px);border-color:rgba(59,130,246,.28);background:linear-gradient(180deg,rgba(59,130,246,.05),rgba(255,255,255,.01))}
      .mf-surface:hover::before{opacity:1}
      .mf-surface-glyph{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.22);font-family:var(--font-mono);font-size:12px;font-weight:600;color:var(--accent,#3b82f6);margin-bottom:14px;position:relative;z-index:1}
      .mf-surface-name{position:relative;z-index:1;display:block;font-family:var(--font-display);font-size:14px;font-weight:600;color:#fff;letter-spacing:-.01em;margin-bottom:4px}
      .mf-surface-desc{position:relative;z-index:1;display:block;font-size:11.5px;line-height:1.4;color:rgba(225,228,236,.5);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:.08em}

      .mf-six-bottom{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:18px;padding-top:28px;color:rgba(225,228,236,.42);font-size:12.5px;font-family:var(--font-mono);letter-spacing:.02em}
      .mf-six-bottom-meta{display:inline-flex;align-items:center;gap:18px}
      .mf-six-bottom-meta a{color:rgba(225,228,236,.62);text-decoration:none;transition:color .18s ease}
      .mf-six-bottom-meta a:hover{color:#fff}
      .mf-six-wordmark{position:absolute;left:50%;bottom:-20px;transform:translateX(-50%);font-family:var(--font-display);font-style:italic;font-weight:500;font-size:clamp(110px,18vw,260px);line-height:.9;letter-spacing:-.05em;background:linear-gradient(180deg,rgba(255,255,255,.06) 0%,rgba(255,255,255,.0) 70%);-webkit-background-clip:text;background-clip:text;color:transparent;pointer-events:none;user-select:none;z-index:1;white-space:nowrap}

      @media(max-width:980px){.mf-six-top{grid-template-columns:1fr 1fr;gap:42px}.mf-six-brand{grid-column:1/-1;max-width:none}.mf-six-surfaces{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:560px){.mf-six-top{grid-template-columns:1fr;gap:32px}.mf-six-surfaces{grid-template-columns:repeat(2,1fr);gap:10px}.mf-six-bottom{flex-direction:column;align-items:flex-start;gap:10px}.zauth-footer-cta{padding:64px 18px 48px}.zauth-footer-cta-card{padding:30px 24px;border-radius:22px}.zauth-footer-cta-actions a{width:100%}.mf-six-wordmark{font-size:90px;bottom:-10px}}
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
    const favicon = (domain) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;

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
      // Generous height so the scroll-pin can lit each word with airy spacing
      section.style.height = '260vh';
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
    const SURFACES = [
      { code: 'Mt', name: 'Meters',    desc: 'Paid routes' },
      { code: 'Rc', name: 'Receipts',  desc: 'On-chain' },
      { code: 'Bg', name: 'Budgets',   desc: 'Spend caps' },
      { code: 'Pr', name: 'Provider',  desc: 'Revenue' },
      { code: 'Mc', name: 'MCP',       desc: 'Agent tools' },
      { code: 'Gw', name: 'Gateway',   desc: 'Edge routing' },
    ];

    function buildFooter() {
      const footer = $('.site-footer');
      if (!footer) return;
      const cta = $('.cta');
      const ctaMarkup = `<section class="zauth-footer-cta reveal" aria-label="Build with Meterflow">
        <div class="zauth-footer-cta-card">
          <h2>Become one with <em>Meterflow.</em></h2>
          <p>Join the providers building the payment, receipt, and spend-control layer for autonomous agents on Solana.</p>
          <div class="zauth-footer-cta-actions">
            <a href="/dashboard">Launch Dashboard
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8h9m0 0L8.5 4.5M12 8l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </a>
            <a href="/apply">Apply as provider</a>
          </div>
        </div>
      </section>`;
      if (cta) cta.outerHTML = ctaMarkup;

      footer.className = 'mf-six-footer';
      footer.innerHTML = `
        <canvas class="mf-six-canvas" aria-hidden="true"></canvas>
        <div class="mf-six-grid" aria-hidden="true"></div>
        <div class="mf-six-shell">
          <div class="mf-six-top">
            <div class="mf-six-brand">
              <a class="mf-six-brand-mark" href="/" aria-label="Meterflow home">
                <img src="/assets/brand/meterflow-mark.svg" alt="" aria-hidden="true">
                <span>Meterflow</span>
              </a>
              <p class="mf-six-tagline">Control plane for agent commerce on Solana. Meter endpoints, track receipts, cap autonomous spend.</p>
              <span class="mf-six-status"><span class="mf-six-status-dot"></span>All systems live</span>
            </div>
            <div class="mf-six-col">
              <h3>Product</h3>
              <ul>
                <li><a href="/dashboard">Dashboard</a></li>
                <li><a href="/#tools">Tools</a></li>
                <li><a href="/how-it-works">How it works</a></li>
                <li><a href="/token">Token</a></li>
                <li><a href="/status">Status</a></li>
              </ul>
            </div>
            <div class="mf-six-col">
              <h3>Resources</h3>
              <ul>
                <li><a href="/docs">Documentation</a></li>
                <li><a href="/roadmap">Roadmap</a></li>
                <li><a href="/apply">Apply as provider</a></li>
                <li><a href="https://github.com/nullxnothing/meterflow" target="_blank" rel="noopener">GitHub <span class="ext">↗</span></a></li>
              </ul>
            </div>
            <div class="mf-six-col">
              <h3>Connect</h3>
              <ul>
                <li><a href="https://x.com/meterflowsol" target="_blank" rel="noopener">Twitter <span class="ext">↗</span></a></li>
                <li><a href="https://discord.gg/tned74z4eN" target="_blank" rel="noopener">Discord <span class="ext">↗</span></a></li>
                <li><a href="/privacy">Privacy</a></li>
                <li><a href="/terms">Terms</a></li>
              </ul>
            </div>
          </div>

          <div class="mf-six-surfaces" aria-label="Six surfaces of agent commerce">
            ${SURFACES.map((s) => `
              <a class="mf-surface" href="/#tools" aria-label="${s.name}">
                <span class="mf-surface-glyph">${s.code}</span>
                <span class="mf-surface-name">${s.name}</span>
                <span class="mf-surface-desc">${s.desc}</span>
              </a>`).join('')}
          </div>

          <div class="mf-six-bottom">
            <span>© 2026 Meterflow · settled on Solana</span>
            <span class="mf-six-bottom-meta">
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
              <a href="/status">Status</a>
            </span>
          </div>
        </div>
        <div class="mf-six-wordmark" aria-hidden="true">meterflow</div>
      `;
      paintFooterCanvas();
    }

    /* Lightweight animated "surface waves" canvas for the footer */
    function paintFooterCanvas() {
      const canvas = $('.mf-six-canvas');
      if (!canvas || reducedMotion) return;
      const ctx = canvas.getContext('2d');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let raf = 0;
      const layers = [
        { amp: 18, freq: 0.0042, speed: 0.0008, y: 0.38, color: 'rgba(59,130,246,0.20)' },
        { amp: 22, freq: 0.0036, speed: -0.0006, y: 0.55, color: 'rgba(120,170,255,0.13)' },
        { amp: 28, freq: 0.0028, speed: 0.0005, y: 0.72, color: 'rgba(255,255,255,0.08)' },
      ];
      function resize() {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      function draw(t) {
        const w = canvas.width / dpr, h = canvas.height / dpr;
        ctx.clearRect(0, 0, w, h);
        layers.forEach((l) => {
          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let x = 0; x <= w; x += 4) {
            const y = h * l.y + Math.sin(x * l.freq + t * l.speed) * l.amp + Math.sin(x * l.freq * 1.7 + t * l.speed * 1.3) * (l.amp * 0.32);
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.closePath();
          ctx.fillStyle = l.color;
          ctx.fill();
        });
      }
      function loop(time) { draw(time); raf = requestAnimationFrame(loop); }
      const ro = new ResizeObserver(resize);
      ro.observe(canvas);
      resize();
      raf = requestAnimationFrame(loop);
      window.addEventListener('pagehide', () => cancelAnimationFrame(raf), { once: true });
    }

    /* ────────────────────────────────────────────── Reveal motion ─ */
    function initMotion() {
      const targets = [
        'nav.mf-nav','.hero-headline','.hero-sub','.hero-actions','.integration-logo-marquee',
        '.section-header','.tools-grid','.how-step','.zauth-footer-cta-card',
        '.mf-six-brand','.mf-six-col','.mf-surface'
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

    async function initGSAPReveal() {
      const section = $('.mf-text-reveal');
      const wordEls = $$('.mf-word', section || document);
      if (!section || !wordEls.length || reducedMotion) return;

      try {
        if (!window.gsap) await loadScript('https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js');
        if (!window.ScrollTrigger) await loadScript('https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js');
        const { gsap } = window;
        gsap.registerPlugin(window.ScrollTrigger);

        // Precisely lit-up reveal: each word transitions from dim → bright across the
        // pinned scroll window. ScrollTrigger keeps it perfectly aligned to scroll position.
        gsap.set(wordEls, { color: 'rgba(255,255,255,0.14)' });

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 0.6,
          }
        });

        wordEls.forEach((el, i) => {
          const accent = el.classList.contains('accent');
          tl.to(el, {
            color: accent ? 'var(--accent, #3b82f6)' : 'rgba(255,255,255,1)',
            textShadow: accent ? '0 0 22px rgba(59,130,246,0.45)' : '0 0 0 rgba(0,0,0,0)',
            duration: 0.5,
            ease: 'none',
            onStart: () => el.classList.add('lit'),
            onReverseComplete: () => el.classList.remove('lit'),
          }, i * 0.5);
        });

        // The CSS-based .mf-load → .mf-in reveal (via IntersectionObserver in initMotion)
        // already handles section/card fade-ins, so we deliberately don't duplicate them here.

        // Hero subtle parallax for the headline (keeps things lively without overdoing it)
        const headline = $('.hero-headline');
        if (headline) {
          gsap.to(headline, {
            yPercent: -8,
            opacity: 0.85,
            ease: 'none',
            scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.4 }
          });
        }
      } catch (e) {
        // Graceful fallback: simple scroll listener if GSAP can't load
        let ticking = false;
        const tick = () => {
          const rect = section.getBoundingClientRect();
          const max = Math.max(1, section.offsetHeight - window.innerHeight);
          const progress = Math.min(1, Math.max(0, -rect.top / max));
          wordEls.forEach((word, i) => {
            const t = i / wordEls.length;
            word.classList.toggle('lit', progress >= t);
          });
          ticking = false;
        };
        const onScroll = () => { if (!ticking) { requestAnimationFrame(tick); ticking = true; } };
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        tick();
      }
    }

    function statFallbacks() {
      const data = { 'ps-alltime-calls':'Preview','ps-alltime-tokens':'USDC','ps-money-saved':'Live','ps-active-keys':'Keys','ps-models':'Routes','ps-uptime':'Online' };
      Object.entries(data).forEach(([id, value]) => { const el = document.getElementById(id); if (el && (!el.textContent || el.textContent.trim() === '---')) el.textContent = value; });
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
    buildFooter();
    initMotion();
    initGSAPReveal();
    initNavScroll();
    statFallbacks();
  });
})();
