// ═══════════════════════════════════════════
// Meterflow Dashboard - Event Bindings
// ═══════════════════════════════════════════

import { STATE } from './state.js';
import { getWalletProviders, connectWallet } from './wallet.js?v=v10-ledger';
import { setTab } from './actions.js';
import { bindCodeCopyButtons, bindCodeToggleButtons } from './tools.js';
import { render } from './render.js';
import { animateDashboardCounters } from './ui.js';

export function bindEvents(scope = document) {
  // Navigation — only bind nav items within scope to avoid duplicates
  scope.querySelectorAll('.nav-item[data-tab]').forEach(item => {
    item.addEventListener('click', () => setTab(item.dataset.tab));
  });

  // Wallet connect buttons
  document.querySelectorAll('[data-provider]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.provider);
      const providers = getWalletProviders();
      if (providers[idx]) connectWallet(providers[idx].provider);
    });
  });

  const agentWalletInput = document.getElementById('agentWalletInput');
  if (agentWalletInput) {
    agentWalletInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        import('./tabs/holder-tools.js').then(mod => mod.runWalletDeepDive());
      }
    });
  }

  bindCodeCopyButtons();
  bindCodeToggleButtons();
  animateDashboardCounters(scope);

  // Mouse-tracking glow on cards
  scope.querySelectorAll('.stat-card, .tool-card, .connection-card, .recipe-card, .agent-card, .api-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
      card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
    });
  });

  // Mobile hamburger menu — only bind on full render, not scoped tab switches
  if (scope !== document) return;
  const menuBtn = document.getElementById('mobileMenuBtn');
  const overlay = document.getElementById('mobileNavOverlay');
  const drawer = document.getElementById('mobileNavDrawer');
  const closeBtn = document.getElementById('mobileNavClose');

  if (menuBtn && overlay && drawer) {
    menuBtn.addEventListener('click', () => {
      overlay.classList.add('open');
      drawer.classList.add('open');
    });
    const closeMobileNav = () => {
      drawer.classList.remove('open');
      setTimeout(() => overlay.classList.remove('open'), 300);
    };
    if (closeBtn) closeBtn.addEventListener('click', closeMobileNav);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeMobileNav();
    });

    // Swipe-to-close on mobile drawer
    let touchStartX = 0;
    drawer.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    drawer.addEventListener('touchend', (e) => {
      const deltaX = e.changedTouches[0].clientX - touchStartX;
      if (deltaX < -60) closeMobileNav();
    }, { passive: true });

    // Bind nav items inside mobile drawer
    drawer.querySelectorAll('.nav-item[data-tab]').forEach(item => {
      item.addEventListener('click', () => {
        setTab(item.dataset.tab);
        closeMobileNav();
      });
    });
  }
}

// ─── Global Keyboard Shortcuts ───

document.addEventListener('keydown', (e) => {
  const isMod = e.metaKey || e.ctrlKey;

  // Cmd/Ctrl+K is handled by the command palette module.
  if (isMod && e.key === 'k') {
    e.preventDefault();
    window.openCommandPalette?.();
  }

  // Escape → close mobile nav, notification panels
  if (e.key === 'Escape') {
    const overlay = document.getElementById('mobileNavOverlay');
    const drawer = document.getElementById('mobileNavDrawer');
    if (overlay?.classList.contains('open')) {
      drawer?.classList.remove('open');
      setTimeout(() => overlay.classList.remove('open'), 300);
    }
    // Close agent notification panel
    const notifPanel = document.querySelector('.agent-notif-panel');
    if (notifPanel) {
      import('./state.js').then(m => { m.AGENTS.notifOpen = false; });
      notifPanel.remove();
    }
  }

  // Cmd/Ctrl+Shift+N → new conversation
  if (isMod && e.shiftKey && e.key === 'N') {
    e.preventDefault();
    import('./session.js').then(m => m.newConversation());
  }
});
