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

      /* ─── Unified Meterflow nav: dark glass, text-first, no route-code chips ─── */
      body > nav.mf-nav{height:72px;padding:0 clamp(20px,3.4vw,42px)!important;display:flex;align-items:center;gap:18px;justify-content:space-between;background:linear-gradient(180deg,rgba(5,8,15,.84),rgba(5,8,15,.56))!important;backdrop-filter:saturate(145%) blur(18px);-webkit-backdrop-filter:saturate(145%) blur(18px);border-bottom:1px solid rgba(156,184,220,.1)!important;box-shadow:0 18px 70px rgba(0,0,0,.2)!important;position:fixed;top:0;left:0;right:0;z-index:50}
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
        const dimWordColor = 'rgba(255,255,255,0.14)';
        const brightWordColor = 'rgba(255,255,255,1)';
        const accentColor = resolveCssColor('var(--accent, #4f9cff)', '#4f9cff');
        const accentGlow = colorWithAlpha(accentColor, 0.45);
        const accentGlowStart = colorWithAlpha(accentColor, 0);
        const accentWordEls = wordEls.filter((el) => el.classList.contains('accent'));

        gsap.set(wordEls, { color: dimWordColor });
        gsap.set(accentWordEls, { textShadow: `0 0 0 ${accentGlowStart}` });

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 0.6,
            invalidateOnRefresh: true,
          }
        });

        wordEls.forEach((el, i) => {
          const accent = el.classList.contains('accent');
          const tween = {
            color: accent ? accentColor : brightWordColor,
            duration: 0.5,
            ease: 'none',
          };
          if (accent) tween.textShadow = `0 0 22px ${accentGlow}`;
          tl.to(el, tween, i * 0.5);
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
            scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.4, invalidateOnRefresh: true }
          });
        }

        requestAnimationFrame(() => requestAnimationFrame(() => window.ScrollTrigger.refresh()));
        if (document.fonts?.ready) {
          document.fonts.ready.then(() => window.ScrollTrigger.refresh()).catch(() => {});
        }
      } catch (e) {
        // Graceful fallback: simple scroll listener if GSAP can't load
        section.classList.add('mf-fallback');
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

        navEl.querySelectorAll('.fan-dot').forEach((dot, idx) => {
          const on = idx === active;
          dot.classList.toggle('active', on);
          dot.setAttribute('aria-selected', String(on));
        });
      }

      function goTo(i) {
        active = ((i % LEN) + LEN) % LEN;
        layout();
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
      });

      // Keyboard arrow navigation
      stage.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goTo(active - 1); }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goTo(active + 1); }
      });

      // Touch swipe
      let touchStartX = 0;
      stage.addEventListener('touchstart', (e) => { touchStartX = e.touches[0] ? e.touches[0].clientX : 0; }, { passive: true });
      stage.addEventListener('touchend', (e) => {
        const dx = (e.changedTouches[0] ? e.changedTouches[0].clientX : touchStartX) - touchStartX;
        if (dx > 55) goTo(active - 1);
        else if (dx < -55) goTo(active + 1);
      }, { passive: true });

      // Re-layout on resize (spacing is derived from rendered card width)
      let resizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(layout, 80);
      });

      layout();
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
    window.MeterflowInitFooterWaves?.();
    initMotion();
    initFanStack();
    initGSAPReveal();
    initNavScroll();
  });
})();
