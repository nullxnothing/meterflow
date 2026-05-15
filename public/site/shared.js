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
  const DEXSCREENER_URL = 'https://dexscreener.com/solana/gaghzanyewj7blbgwlyxnus1vgkdch33d8qzm4hwtkhy';
  const DEXSCREENER_PATH = 'M 166 173 L 166 175 L 162 182 L 157 197 L 155 200 L 149 221 L 147 236 L 146 237 L 146 243 L 145 244 L 145 254 L 144 255 L 144 367 L 143 368 L 143 387 L 142 388 L 141 410 L 140 411 L 140 418 L 139 419 L 139 425 L 138 426 L 135 450 L 134 451 L 134 455 L 132 460 L 128 481 L 117 517 L 115 520 L 113 528 L 104 548 L 104 550 L 92 575 L 90 577 L 165 517 L 168 519 L 220 604 L 264 562 L 277 551 L 367 697 L 368 697 L 382 673 L 391 660 L 395 652 L 458 551 L 515 604 L 567 519 L 570 517 L 644 577 L 634 557 L 634 555 L 630 548 L 620 523 L 609 489 L 603 465 L 600 446 L 599 445 L 596 421 L 595 420 L 594 403 L 593 402 L 592 373 L 591 372 L 591 258 L 590 257 L 589 238 L 588 237 L 588 232 L 587 231 L 584 214 L 578 195 L 572 180 L 561 159 L 544 182 L 527 201 L 525 202 L 525 204 L 532 217 L 536 229 L 537 240 L 538 241 L 538 252 L 537 253 L 536 264 L 534 270 L 526 285 L 513 299 L 503 306 L 491 312 L 474 317 L 454 318 L 455 331 L 456 332 L 456 350 L 528 392 L 523 396 L 464 429 L 452 440 L 440 456 L 420 494 L 408 524 L 407 529 L 405 532 L 390 578 L 390 581 L 385 595 L 385 598 L 380 612 L 380 615 L 370 646 L 370 649 L 367 654 L 357 623 L 356 616 L 353 609 L 353 606 L 346 585 L 346 582 L 329 530 L 313 490 L 296 458 L 282 439 L 271 429 L 207 393 L 208 391 L 278 351 L 279 330 L 280 329 L 281 318 L 261 317 L 239 310 L 223 300 L 211 288 L 202 273 L 197 255 L 198 233 L 202 219 L 210 203 L 190 181 L 174 159 Z M 153 70 L 157 81 L 165 97 L 180 120 L 203 148 L 228 173 L 250 192 L 279 214 L 309 233 L 328 243 L 331 243 L 336 239 L 346 234 L 362 230 L 373 230 L 374 231 L 383 232 L 399 239 L 404 243 L 407 243 L 436 227 L 460 211 L 499 180 L 538 141 L 557 117 L 567 102 L 576 85 L 581 71 L 570 84 L 552 98 L 542 103 L 528 106 L 515 93 L 493 76 L 477 66 L 447 52 L 425 45 L 421 45 L 416 43 L 401 41 L 400 40 L 384 39 L 383 38 L 352 38 L 351 39 L 342 39 L 341 40 L 323 42 L 306 46 L 285 53 L 271 60 L 269 60 L 267 62 L 251 70 L 236 80 L 220 93 L 207 106 L 193 103 L 177 94 L 169 88 L 159 78 Z M 362 267 L 349 272 L 338 281 L 328 294 L 323 304 L 317 326 L 317 333 L 316 334 L 316 367 L 314 371 L 309 376 L 281 392 L 294 400 L 304 408 L 320 425 L 333 444 L 350 480 L 363 518 L 363 521 L 367 533 L 368 533 L 370 524 L 377 505 L 377 502 L 379 499 L 386 477 L 403 442 L 415 425 L 432 407 L 445 397 L 454 392 L 424 375 L 419 368 L 419 336 L 418 335 L 417 322 L 412 304 L 405 291 L 390 275 L 384 271 L 373 267 Z M 496 228 L 485 237 L 463 252 L 425 273 L 433 277 L 448 281 L 464 281 L 465 280 L 469 280 L 479 277 L 486 273 L 494 266 L 500 255 L 500 250 L 501 249 L 500 238 Z M 238 229 L 234 243 L 235 255 L 240 265 L 246 271 L 252 275 L 262 279 L 270 280 L 271 281 L 286 281 L 287 280 L 296 279 L 310 273 L 301 269 L 275 254 L 254 240 L 239 228 Z';
  const DEXSCREENER_ICON = `<svg class="nav-social-icon--dexscreener" viewBox="0 0 736 736" fill="currentColor" aria-hidden="true"><path d="${DEXSCREENER_PATH}"/></svg>`;

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

    const navSocials = nav.querySelector('.nav-socials');
    if (navSocials) {
      navSocials.innerHTML = `
        <a class="nav-social" href="https://x.com/meterflowsol" target="_blank" rel="noopener" aria-label="X"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.844l-5.36-7.013L4.16 22H.9l8.025-9.17L1.5 2h6.97l4.84 6.4L18.244 2Zm-1.2 18h1.86L7.04 4H5.05l11.994 16Z"/></svg></a>
        <a class="nav-social" href="https://discord.gg/tned74z4eN" target="_blank" rel="noopener" aria-label="Discord"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.27 5.33a17.6 17.6 0 0 0-4.43-1.38c-.19.34-.4.78-.55 1.13a16.3 16.3 0 0 0-4.92 0c-.15-.36-.37-.79-.56-1.13a17.6 17.6 0 0 0-4.43 1.38A18.06 18.06 0 0 0 .73 17.51a17.7 17.7 0 0 0 5.34 2.7c.41-.56.78-1.16 1.1-1.79a11.7 11.7 0 0 1-1.67-.8c.11-.08.22-.17.33-.26a12.6 12.6 0 0 0 10.74 0c.11.09.22.18.33.26-.53.31-1.09.58-1.67.8.33.63.7 1.23 1.1 1.79a17.6 17.6 0 0 0 5.35-2.7 17.95 17.95 0 0 0-3.46-12.15ZM8.52 15.33c-1.06 0-1.93-.97-1.93-2.16 0-1.2.86-2.17 1.93-2.17 1.08 0 1.94.98 1.93 2.17 0 1.19-.86 2.16-1.93 2.16Zm6.97 0c-1.06 0-1.93-.97-1.93-2.16 0-1.2.85-2.17 1.93-2.17 1.08 0 1.94.98 1.93 2.17 0 1.19-.85 2.16-1.93 2.16Z"/></svg></a>
        <a class="nav-social" href="${DEXSCREENER_URL}" target="_blank" rel="noopener" aria-label="DEX Screener">${DEXSCREENER_ICON}</a>
      `;
    }

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
          <a href="${DEXSCREENER_URL}" target="_blank" rel="noopener">DEX Screener</a>
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
    const existing = document.querySelector('body > footer:not(.fcp-foot):not(.mf-footer-art), .site-footer, .mf-site-footer, .footer');
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
