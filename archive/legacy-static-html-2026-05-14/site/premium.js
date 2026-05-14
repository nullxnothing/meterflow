// Meterflow — premium motion layer
// Scroll-triggered reveals + nav scroll state. Lightweight, zero deps.

(function () {
  if (typeof window === 'undefined') return;

  // Floating CTA visibility (shows after scrolling past hero)
  const floatCta = document.getElementById('floatCta');
  if (floatCta) {
    let visible = false;
    const updateFloat = () => {
      const should = window.scrollY > window.innerHeight * 0.7;
      if (should !== visible) {
        visible = should;
        floatCta.classList.toggle('visible', visible);
      }
    };
    window.addEventListener('scroll', updateFloat, { passive: true });
    updateFloat();
  }

  // Nav scroll state
  const nav = document.querySelector('body > nav');
  if (nav) {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          nav.classList.toggle('scrolled', window.scrollY > 12);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Reveal selectors — section headlines, cards, grids, hero text
  const REVEAL_SELECTORS = [
    '.hero-text > *',
    '.hero-panel',
    '.section-label',
    '.hooks-section h2, .how-headline, .tools-headline, .demo-headline, .tiers-headline, .funded-headline, .agent-headline, .faq-headline, .cta-section h2',
    '.hook-card, .tool-card, .tier-card, .how-step, .funded-step, .stat-block, .agent-card, .faq-item',
    '.tools-sub, .demo-sub, .tiers-sub, .funded-sub, .agent-sub, .cta-sub, .funded-note',
    '.demo-prompts, .demo-grid, .cta-links, .agent-toggle, .agent-tab.active',
    '.stats-hero-row, .stats-grid'
  ];

  const STAGGER_SELECTORS = [
    '.hooks-inner',
    '.how-steps',
    '.tools-grid',
    '.tiers-grid',
    '.funded-flow',
    '.stats-grid',
    '.stats-hero-row'
  ];

  // Apply reveal classes (do not interfere with critical above-the-fold render)
  document.querySelectorAll(REVEAL_SELECTORS.join(',')).forEach((el) => {
    if (el.classList.contains('reveal') || el.closest('nav, .free-access-topbar')) return;
    el.classList.add('reveal');
  });

  document.querySelectorAll(STAGGER_SELECTORS.join(',')).forEach((el) => {
    el.classList.add('reveal-stagger');
    // children should not also be individually revealed inside a stagger parent
    el.querySelectorAll('.reveal').forEach((c) => c.classList.remove('reveal'));
  });

  // Hero — reveal immediately to avoid first-paint flicker
  document.querySelectorAll('.hero .reveal').forEach((el) => {
    requestAnimationFrame(() => el.classList.add('in-view'));
  });

  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal, .reveal-stagger').forEach((el) => el.classList.add('in-view'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  document.querySelectorAll('.reveal, .reveal-stagger').forEach((el) => {
    if (!el.classList.contains('in-view')) io.observe(el);
  });
})();
