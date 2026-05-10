// Global handler — suppress dev-only network errors from proxy 404s
window.addEventListener('unhandledrejection', e => {
  const msg = String(e.reason || '');
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
    e.preventDefault();
  }
});

// Shared site behaviors: mobile menu toggle, ESC close, link-tap close
(function () {
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

// ─── Mouse-tracking spotlight on cards (Linear/Vercel-style) ───
(function () {
  const SEL = '.hook-card, .tool-card, .tier-card, .stat-block, .stats-hero-block, .how-step, .funded-step, .card, .feature-card';
  let raf = null;
  document.addEventListener('mousemove', e => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      const target = e.target.closest(SEL);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      target.style.setProperty('--mx', x + '%');
      target.style.setProperty('--my', y + '%');
    });
  });
})();
