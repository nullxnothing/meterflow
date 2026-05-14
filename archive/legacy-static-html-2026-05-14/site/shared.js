// Global handler — suppress dev-only network errors from proxy 404s
window.addEventListener('unhandledrejection', e => {
  const msg = String(e.reason || '');
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
    e.preventDefault();
  }
});

// Expensive global animated backgrounds intentionally stay off. The shared
// shadow mask in CSS owns page atmosphere across public pages.

// Shared site behaviors: mobile menu toggle, ESC close, link-tap close
(function () {
  function normalizeNav() {
    const nav = document.querySelector('body > nav');
    if (!nav) return;

    const navLinks = nav.querySelector('.nav-links');
    if (navLinks) {
      navLinks.innerHTML = `
        <a href="/docs" data-nav="docs">Docs</a>
        <a href="/how-it-works" data-nav="how-it-works">How it works</a>
        <a href="/token" data-nav="token">Token</a>
        <a href="/roadmap" data-nav="roadmap">Roadmap</a>
      `;
    }

    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenu) {
      mobileMenu.innerHTML = `
        <a href="/docs" data-nav="docs">Docs</a>
        <a href="/how-it-works" data-nav="how-it-works">How it works</a>
        <a href="/token" data-nav="token">Token</a>
        <a href="/roadmap" data-nav="roadmap">Roadmap</a>
        <a href="/dashboard" class="mobile-menu-cta primary" data-nav="dashboard">Launch Dashboard</a>
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
    if (hamburger) hamburger.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mobile-menu-open');
  }
  function toggle() {
    const isOpen = menu.classList.toggle('open');
    if (hamburger) hamburger.classList.toggle('active', isOpen);
    if (hamburger) hamburger.setAttribute('aria-expanded', String(isOpen));
    menu.setAttribute('aria-hidden', String(!isOpen));
    document.body.classList.toggle('mobile-menu-open', isOpen);
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

// Normalize every public page onto the homepage footer structure.
(function () {
  function createSiteFooter() {
    const year = new Date().getFullYear();
    const footer = document.createElement('footer');
    footer.className = 'site-footer site-footer--auto';
    footer.innerHTML = `
      <div class="sf-inner">
        <div class="sf-brand">
          <a href="/" class="sf-logo">
            <img src="/assets/brand/meterflow-mark.svg" width="20" height="20" alt="" aria-hidden="true">
            Meterflow
          </a>
          <p class="sf-tagline">Control plane for agent commerce on Solana. Meter endpoints, track receipts, and cap autonomous spend.</p>
          <a href="/status" class="sf-status" id="statusIndicator"><span class="sf-status-dot"></span>All systems operational</a>
        </div>
        <div class="sf-col">
          <p class="sf-col-label">Products</p>
          <a href="/dashboard">Dashboard</a>
          <a href="/token">Token</a>
          <a href="/how-it-works">How it works</a>
        </div>
        <div class="sf-col">
          <p class="sf-col-label">Resources</p>
          <a href="/docs">Documentation</a>
          <a href="/roadmap">Roadmap</a>
          <a href="/status">Status</a>
          <a href="/apply">Apply as provider</a>
        </div>
        <div class="sf-col">
          <p class="sf-col-label">Connect</p>
          <a href="https://x.com/meterflowsol" target="_blank" rel="noopener">X / Twitter</a>
          <a href="https://discord.gg/tned74z4eN" target="_blank" rel="noopener">Discord</a>
          <a href="https://github.com/nullxnothing/meterflow" target="_blank" rel="noopener">GitHub</a>
        </div>
      </div>
      <div class="sf-bottom">
        <span>&copy; ${year} Meterflow &middot; Built on Solana</span>
        <div class="sf-bottom-links">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </div>
      </div>
    `;
    return footer;
  }

  function ensureFooter() {
    const existing = document.querySelector('body > footer:not(.fcp-foot), .site-footer, .mf-site-footer, .footer');
    if (existing) {
      existing.replaceWith(createSiteFooter());
      return;
    }
    const main = document.querySelector('main');
    if (main) main.insertAdjacentElement('afterend', createSiteFooter());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureFooter, { once: true });
  } else {
    ensureFooter();
  }
})();

// Shared nav scroll state.
(function () {
  let raf = 0;
  function update() {
    document.body.classList.toggle('mf-nav-scrolled', window.scrollY > 12);
    raf = 0;
  }
  window.addEventListener('scroll', () => {
    if (!raf) raf = requestAnimationFrame(update);
  }, { passive: true });
  update();
})();

// Site-wide particle canvas removed for performance.
