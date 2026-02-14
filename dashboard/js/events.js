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

export function bindEvents() {
  // Navigation
  document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
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
}
