// Global handler — suppress dev-only network errors from proxy 404s
window.addEventListener('unhandledrejection', e => {
  const msg = String(e.reason || '');
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
    e.preventDefault();
  }
});

// Shared site behaviors: mobile menu toggle, ESC close, link-tap close
(function () {
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
          <a class="status-indicator" href="/status"><span class="status-indicator-dot"></span> Live status</a>
        </div>
        <div class="site-footer-col">
          <div class="site-footer-col-title">Products</div>
          <a href="/dashboard#meters">Meters</a>
          <a href="/dashboard#receipts">Receipts</a>
          <a href="/dashboard#budgets">Budgets</a>
          <a href="/token">MFLOW utility</a>
        </div>
        <div class="site-footer-col">
          <div class="site-footer-col-title">Resources</div>
          <a href="/docs">Docs</a>
          <a href="/how-it-works">How it works</a>
          <a href="/roadmap">Roadmap</a>
          <a href="/apply">Apply as provider</a>
        </div>
        <div class="site-footer-col">
          <div class="site-footer-col-title">Connect</div>
          <a href="https://x.com/meterflowsol" target="_blank" rel="noopener">X</a>
          <a href="https://discord.gg/tned74z4eN" target="_blank" rel="noopener">Discord</a>
          <a href="https://github.com/nullxnothing/meterflow" target="_blank" rel="noopener">GitHub</a>
          <a class="site-footer-cta" href="/dashboard">Launch dashboard</a>
        </div>
      </div>
      <div class="site-footer-bottom">
        <span>&copy; ${year} Meterflow</span>
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
