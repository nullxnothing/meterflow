// ═══════════════════════════════════════════
// INFINITE Dashboard - Event Bindings
// ═══════════════════════════════════════════

import { STATE, CHAT, TRADING } from './state.js';
import { getWalletProviders, connectWallet } from './wallet.js';
import { setTab } from './actions.js';
import { sendChatMessage } from './chat.js';
import { handleImageUpload } from './images.js';
import { bindCodeCopyButtons } from './tools.js';
import { render } from './render.js';

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

  // Chat-specific bindings
  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 200) + 'px';
    });
  }

  const chatSendBtn = document.getElementById('chatSendBtn');
  if (chatSendBtn) {
    chatSendBtn.addEventListener('click', () => sendChatMessage());
  }

  const modelSelect = document.getElementById('chatModelSelect');
  if (modelSelect) {
    modelSelect.addEventListener('change', () => { CHAT.selectedModel = modelSelect.value; });
  }

  const convSelect = document.getElementById('chatConvSelect');
  if (convSelect) {
    convSelect.addEventListener('change', () => {
      CHAT.activeId = convSelect.value;
      render();
    });
  }

  // Tools are always enabled - no toggles needed

  // Upload button + file input
  const uploadBtn = document.getElementById('chatUploadBtn');
  const fileInput = document.getElementById('chatFileInput');
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      handleImageUpload(e.target.files);
      fileInput.value = '';
    });
  }

  // Connectors button — navigate to connections tab
  const connectorsBtn = document.getElementById('chatConnectorsBtn');
  if (connectorsBtn) {
    connectorsBtn.addEventListener('click', () => {
      STATE.activeTab = 'connections';
      render();
    });
  }

  // Trading-specific bindings
  const tradingInput = document.getElementById('tradingInput');
  if (tradingInput) {
    tradingInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        import('./tabs/trading.js').then(mod => {
          if (mod.sendTradingMessage) mod.sendTradingMessage();
        });
      }
    });
    tradingInput.addEventListener('input', () => {
      tradingInput.style.height = 'auto';
      tradingInput.style.height = Math.min(tradingInput.scrollHeight, 200) + 'px';
    });
  }

  const tradingSendBtn = document.getElementById('tradingSendBtn');
  if (tradingSendBtn) {
    tradingSendBtn.addEventListener('click', () => {
      import('./tabs/trading.js').then(mod => {
        if (mod.sendTradingMessage) mod.sendTradingMessage();
      });
    });
  }

  const tradingModelSelect = document.getElementById('tradingModelSelect');
  if (tradingModelSelect) {
    tradingModelSelect.addEventListener('change', () => { TRADING.selectedModel = tradingModelSelect.value; });
  }

  bindCodeCopyButtons();

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

  // Cmd/Ctrl+K → focus chat input
  if (isMod && e.key === 'k') {
    e.preventDefault();
    const chatInput = document.getElementById('chatInput') || document.getElementById('tradingInput');
    if (chatInput) {
      chatInput.focus();
    } else {
      // Switch to chat tab and focus
      import('./actions.js').then(m => m.setTab('chat'));
      setTimeout(() => document.getElementById('chatInput')?.focus(), 100);
    }
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
