// Global handler — suppress dev-only network errors from proxy 404s
window.addEventListener('unhandledrejection', e => {
  const msg = String(e.reason || '');
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
    e.preventDefault();
  }
});

// Shared site behaviors: mobile menu toggle, ESC close, link-tap close
(function () {
  function normalizeNav() {
    const nav = document.querySelector('body > nav');
    if (!nav) return;

    const navLinks = nav.querySelector('.nav-links');
    if (navLinks) {
      navLinks.innerHTML = `
        <a href="/docs" data-nav="docs"><span class="nav-glyph">Dc</span>Docs</a>
        <a href="/#tools" data-nav="tools"><span class="nav-glyph">Mt</span>Tools</a>
        <a href="/how-it-works" data-nav="how-it-works"><span class="nav-glyph">Hw</span>How it works</a>
        <a href="/token" data-nav="token"><span class="nav-glyph">Tk</span>Token</a>
        <a href="/roadmap" data-nav="roadmap"><span class="nav-glyph">Rm</span>Roadmap</a>
      `;
    }

    const duplicateDocs = nav.querySelector('.nav-docs');
    if (duplicateDocs) duplicateDocs.remove();

    const dashboardCta = nav.querySelector('.nav-cta[data-nav="dashboard"]');
    if (dashboardCta && !dashboardCta.classList.contains('mf-login')) {
      dashboardCta.className = 'mf-login';
      dashboardCta.innerHTML = `
        <svg class="mf-login-wallet" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4.5A2.5 2.5 0 0 1 4.5 2h7A2.5 2.5 0 0 1 14 4.5V5h-1.5A2.5 2.5 0 0 0 10 7.5v1A2.5 2.5 0 0 0 12.5 11H14v.5A2.5 2.5 0 0 1 11.5 14h-7A2.5 2.5 0 0 1 2 11.5v-7Zm9.5 4.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill="currentColor"/></svg>
        <span>Launch Dashboard</span>
      `;
    }
  }

  normalizeNav();

  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const activeByPath = {
    '/docs': 'docs',
    '/how-it-works': 'how-it-works',
    '/token': 'token',
    '/status': 'status',
    '/roadmap': 'roadmap',
    '/apply': 'apply',
    '/dashboard': 'dashboard',
  };
  const activeKey = activeByPath[path];
  if (activeKey) {
    document.querySelectorAll(`[data-nav="${activeKey}"]`).forEach(link => {
      link.classList.add('active');
    });
  }

  const hamburger = document.getElementById('hamburger');
  const menu = document.getElementById('mobileMenu');
  if (!menu) return;

  function close() {
    menu.classList.remove('open');
    if (hamburger) hamburger.classList.remove('active');
  }
  function toggle() {
    const isOpen = menu.classList.toggle('open');
    if (hamburger) hamburger.classList.toggle('active', isOpen);
  }

  if (hamburger) hamburger.addEventListener('click', toggle);

  // Close on link tap
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', close));

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') close();
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!menu.classList.contains('open')) return;
    if (menu.contains(e.target)) return;
    if (hamburger && hamburger.contains(e.target)) return;
    close();
  });

  // Expose for inline onclick handlers
  window.closeMobile = close;
})();

// Ensure every public static page has the same footer shell. The home page
// keeps its authored footer; legacy simple footers are upgraded in place.
(function () {
  function createSiteFooter() {
    const year = new Date().getFullYear();
    const footer = document.createElement('footer');
    footer.className = 'site-footer site-footer--auto';
    footer.innerHTML = `
      <div class="site-footer-wordmark" aria-hidden="true"><em>meterflow</em></div>
      <div class="site-footer-inner">
        <div class="site-footer-brand">
          <a href="/" class="site-footer-logo">
            <img class="brand-mark" src="/assets/brand/meterflow-mark.svg" alt="" aria-hidden="true">
            <span>Meterflow</span>
          </a>
          <p class="site-footer-tagline">Control plane for agent commerce on Solana. Meter endpoints, track receipts, and cap autonomous spend.</p>
          <a href="/status" class="status-indicator" title="API operational status"><span class="status-indicator-dot"></span><span class="status-indicator-text">All systems operational</span></a>
        </div>
        <div class="site-footer-col">
          <div class="site-footer-col-title">Products</div>
          <a href="/dashboard">Dashboard</a>
          <a href="/#tools">Surfaces</a>
          <a href="/token">Token</a>
          <a href="/how-it-works">How it works</a>
        </div>
        <div class="site-footer-col">
          <div class="site-footer-col-title">Resources</div>
          <a href="/docs">Documentation</a>
          <a href="/how-it-works">How it works</a>
          <a href="/roadmap">Roadmap</a>
          <a href="/apply">Apply as provider</a>
        </div>
        <div class="site-footer-col">
          <div class="site-footer-col-title">Connect</div>
          <a href="https://x.com/meterflowsol" target="_blank" rel="noopener">X / Twitter</a>
          <a href="https://discord.gg/tned74z4eN" target="_blank" rel="noopener">Discord</a>
          <a href="https://github.com/nullxnothing/meterflow" target="_blank" rel="noopener">GitHub</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </div>
      </div>
      <div class="site-footer-bottom">
        <span>&copy; ${year} Meterflow &middot; Built on Solana</span>
        <span class="site-footer-bottom-meta">Metering &middot; Receipts &middot; Spend control</span>
      </div>
    `;
    return footer;
  }

  function ensureFooter() {
    if (document.querySelector('.site-footer, .mf-site-footer')) return;

    const existing = document.querySelector('footer, .footer');
    if (existing) {
      existing.replaceWith(createSiteFooter());
      return;
    }

    const main = document.querySelector('main');
    if (!main) return;
    main.insertAdjacentElement('afterend', createSiteFooter());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureFooter, { once: true });
  } else {
    ensureFooter();
  }
})();

// Shared public-page particle field. Home keeps its hero-specific canvas; the
// rest of the public site gets the same top-to-bottom motion language.
(function () {
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const skip =
    reduceMotion ||
    path === '/' ||
    path.endsWith('/index.html') ||
    path.startsWith('/dashboard') ||
    path.startsWith('/admin') ||
    document.getElementById('heroParticles');

  if (skip) return;

  function initPageParticles() {
    if (!document.body || document.querySelector('.mf-page-particles')) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'mf-page-particles';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.classList.add('has-page-particles');
    document.body.prepend(canvas);

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      canvas.remove();
      document.body.classList.remove('has-page-particles');
      return;
    }

    const state = {
      width: 1,
      height: 1,
      dpr: 1,
      parts: [],
      frame: 0,
      last: 0,
      running: true,
    };

    function createParticle(randomY = true) {
      return {
        x: Math.random() * state.width,
        y: randomY ? Math.random() * state.height : -12 - Math.random() * 120,
        r: 0.55 + Math.random() * 1.35,
        len: 18 + Math.random() * 42,
        speed: 0.018 + Math.random() * 0.042,
        drift: (Math.random() - 0.5) * 0.018,
        alpha: 0.15 + Math.random() * 0.42,
        phase: Math.random() * Math.PI * 2,
        sway: 0.0007 + Math.random() * 0.0015,
        tint: Math.random() > 0.42 ? '180, 200, 240' : '79, 156, 255',
      };
    }

    function resize() {
      state.width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
      state.height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
      state.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(state.width * state.dpr);
      canvas.height = Math.round(state.height * state.dpr);
      canvas.style.width = `${state.width}px`;
      canvas.style.height = `${state.height}px`;
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

      const targetCount = Math.min(150, Math.max(46, Math.round((state.width * state.height) / 15500)));
      state.parts = Array.from({ length: targetCount }, () => createParticle(true));
    }

    function resetParticle(particle) {
      particle.x = Math.random() * state.width;
      particle.y = -12 - Math.random() * Math.max(120, state.height * 0.18);
      particle.speed = 0.018 + Math.random() * 0.042;
      particle.alpha = 0.15 + Math.random() * 0.42;
      particle.len = 18 + Math.random() * 42;
      particle.phase = Math.random() * Math.PI * 2;
    }

    function draw(time) {
      const dt = Math.min(44, time - state.last || 16);
      state.last = time;
      ctx.clearRect(0, 0, state.width, state.height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';

      state.parts.forEach(particle => {
        particle.phase += particle.sway * dt;
        particle.y += particle.speed * dt;
        particle.x += (particle.drift + Math.sin(time * particle.sway + particle.phase) * 0.006) * dt;

        if (particle.y > state.height + particle.len + 8) resetParticle(particle);
        if (particle.x < -20) particle.x = state.width + 20;
        else if (particle.x > state.width + 20) particle.x = -20;

        const edgeFade = Math.min(1, particle.y / 90, (state.height + 70 - particle.y) / 140);
        if (edgeFade <= 0) return;

        const pulse = 0.68 + 0.32 * Math.sin(particle.phase);
        const alpha = particle.alpha * pulse * edgeFade;
        const trailAlpha = Math.max(0, alpha * 0.26);

        ctx.beginPath();
        ctx.moveTo(particle.x - particle.drift * 120, particle.y - particle.len);
        ctx.lineTo(particle.x, particle.y);
        ctx.lineWidth = Math.max(0.55, particle.r * 0.72);
        ctx.strokeStyle = `rgba(${particle.tint}, ${trailAlpha.toFixed(3)})`;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${particle.tint}, ${alpha.toFixed(3)})`;
        ctx.fill();
      });
    }

    function tick(time) {
      if (!state.running) {
        state.frame = 0;
        return;
      }
      draw(time);
      state.frame = window.requestAnimationFrame(tick);
    }

    function start() {
      if (state.frame) return;
      state.running = true;
      state.last = 0;
      state.frame = window.requestAnimationFrame(tick);
    }

    function stop() {
      state.running = false;
      if (state.frame) window.cancelAnimationFrame(state.frame);
      state.frame = 0;
    }

    window.MeterflowPageParticles = {
      snapshot: () => state.parts.slice(0, 6).map(particle => ({
        x: Math.round(particle.x),
        y: Math.round(particle.y),
      })),
      count: () => state.parts.length,
    };

    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    });

    resize();
    draw(0);
    start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPageParticles, { once: true });
  } else {
    initPageParticles();
  }
})();

// Premium animated footer wave field. Canvas keeps the zauth-like motion without SVG DOM churn.
(function () {
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  function createFooterWaves(footer) {
    if (Array.from(footer.children).some(child => child.classList && child.classList.contains('footer-waves'))) return;

    footer.classList.add('footer-waves-ready');

    const layer = document.createElement('div');
    layer.className = 'footer-waves';
    layer.setAttribute('aria-hidden', 'true');

    const canvas = document.createElement('canvas');
    canvas.className = 'footer-waves-canvas';
    layer.append(canvas);
    footer.prepend(layer);

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const state = {
      width: 1,
      height: 1,
      dpr: 1,
      active: true,
      lastFrame: 0,
      frame: 0,
      mouse: {
        x: -999,
        y: 0,
        sx: -999,
        sy: 0,
        lx: -999,
        ly: 0,
        speed: 0,
        angle: 0,
        inside: false,
      },
    };

    function resize() {
      const rect = footer.getBoundingClientRect();
      state.width = Math.max(1, Math.round(rect.width));
      state.height = Math.max(1, Math.round(rect.height));
      state.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(state.width * state.dpr);
      canvas.height = Math.round(state.height * state.dpr);
      canvas.style.width = `${state.width}px`;
      canvas.style.height = `${state.height}px`;
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    }

    function setMouse(event) {
      const rect = footer.getBoundingClientRect();
      const mouse = state.mouse;
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
      if (!mouse.inside || mouse.sx < -100) {
        mouse.sx = mouse.x;
        mouse.sy = mouse.y;
        mouse.lx = mouse.x;
        mouse.ly = mouse.y;
      }
      mouse.inside = true;
    }

    function draw(time) {
      const mouse = state.mouse;
      mouse.sx += (mouse.x - mouse.sx) * 0.1;
      mouse.sy += (mouse.y - mouse.sy) * 0.1;

      const dx = mouse.x - mouse.lx;
      const dy = mouse.y - mouse.ly;
      mouse.speed += (Math.min(120, Math.hypot(dx, dy)) - mouse.speed) * 0.12;
      mouse.angle = Math.atan2(dy, dx);
      mouse.lx = mouse.x;
      mouse.ly = mouse.y;

      ctx.clearRect(0, 0, state.width, state.height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const xGap = state.width < 720 ? 20 : 18;
      const yGap = state.width < 720 ? 18 : 15;
      const lineCount = Math.ceil((state.width + 220) / xGap);
      const pointCount = Math.ceil((state.height + 130) / yGap);
      const xStart = -110;
      const yStart = -54;

      for (let i = 0; i < lineCount; i += 1) {
        ctx.beginPath();
        ctx.lineWidth = i % 7 === 0 ? 1.05 : 0.8;
        ctx.strokeStyle = i % 7 === 0 ? 'rgba(86, 164, 255, 0.24)' : 'rgba(232, 241, 255, 0.118)';

        for (let j = 0; j < pointCount; j += 1) {
          const bx = xStart + i * xGap;
          const by = yStart + j * yGap;
          const wave =
            Math.sin(bx * 0.009 + time * 0.00038 + i * 0.21) +
            Math.sin(by * 0.018 - time * 0.00026 + i * 0.13) * 0.65 +
            Math.sin((bx + by) * 0.006 + time * 0.00018) * 0.45;

          let x = bx + Math.cos(wave + i * 0.09) * 13;
          let y = by + Math.sin(wave) * 7;

          if (mouse.inside) {
            const mdx = x - mouse.sx;
            const mdy = y - mouse.sy;
            const dist = Math.hypot(mdx, mdy);
            const radius = 165 + mouse.speed * 0.9;
            if (dist < radius) {
              const strength = (1 - dist / radius) ** 2;
              const force = strength * (18 + mouse.speed * 0.12);
              x += Math.cos(mouse.angle || 0) * force;
              y += Math.sin(mouse.angle || 0) * force;
            }
          }

          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.stroke();
      }
    }

    function tick(time) {
      if (state.active && time - state.lastFrame > 33) {
        draw(time);
        state.lastFrame = time;
      }
      state.frame = window.requestAnimationFrame(tick);
    }

    footer.addEventListener('pointermove', setMouse, { passive: true });
    footer.addEventListener('pointerleave', () => {
      state.mouse.inside = false;
      state.mouse.x = -999;
    }, { passive: true });

    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(resize);
      observer.observe(footer);
    } else {
      window.addEventListener('resize', resize, { passive: true });
    }

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        state.active = entries.some(entry => entry.isIntersecting);
      }, { rootMargin: '180px' });
      observer.observe(footer);
    }

    resize();
    draw(0);
    state.frame = window.requestAnimationFrame(tick);
  }

  function initFooterWaves(root = document) {
    const footers = Array.from(new Set(root.querySelectorAll('footer, .footer, .site-footer, .mf-site-footer')));
    footers.forEach(createFooterWaves);
  }

  window.MeterflowInitFooterWaves = initFooterWaves;
  initFooterWaves();
  document.addEventListener('DOMContentLoaded', () => initFooterWaves(), { once: true });
  window.addEventListener('load', () => initFooterWaves(), { once: true });
  window.setTimeout(() => initFooterWaves(), 250);
})();
