// ═══════════════════════════════════════════
// INFINITE Dashboard - Actions
// ═══════════════════════════════════════════

import { STATE, TRADING } from './state.js';
import { api, maskKey } from './api.js';
import { saveSession, clearSession } from './session.js';
import { render } from './render.js';

// ─── API Key Actions ───

export async function rotateKey() {
  if (!confirm('Rotate your API key? The old key will stop working immediately.')) return;
  const btn = document.querySelector('[onclick="rotateKey()"]');
  if (btn) btn.classList.add('btn-loading');
  try {
    const data = await api('/auth/rotate', { method: 'POST' });
    STATE.apiKeyFull = data.apiKey;
    STATE.apiKey = maskKey(data.apiKey);
    STATE.tier = data.tier;
    STATE.keyVisible = false;
    saveSession();
    showToast('Key rotated successfully');
  } catch (err) {
    showToast(err.message || 'Rotate failed', true);
  }
  if (btn) btn.classList.remove('btn-loading');
  render();
}

export async function revokeKey() {
  if (!confirm('Revoke your API key? All active sessions will be terminated.')) return;
  const btn = document.querySelector('[onclick="revokeKey()"]');
  if (btn) btn.classList.add('btn-loading');
  try {
    await api('/auth/revoke', { method: 'POST' });
    showToast('Key revoked');
  } catch (err) {
    showToast(err.message || 'Revoke failed', true);
  }
  if (btn) btn.classList.remove('btn-loading');
  clearSession();
  render();
}

export function disconnectWallet() {
  if (STATE.walletProvider?.disconnect) STATE.walletProvider.disconnect();
  clearSession();
  render();
}

export function toggleKeyVisibility() {
  STATE.keyVisible = !STATE.keyVisible;
  const el = document.getElementById('apiKeyDisplay');
  if (el) el.textContent = STATE.keyVisible ? STATE.apiKeyFull : STATE.apiKey;
}

// ─── Navigation ───

export function setTab(tab) {
  if (STATE.activeTab === 'trading' && tab !== 'trading') {
    stopBotPolling();
  }
  STATE.activeTab = tab;
  render();
}

// ─── Bot Polling Control ───

export function stopBotPolling() {
  if (TRADING.pollInterval) {
    clearInterval(TRADING.pollInterval);
    TRADING.pollInterval = null;
  }
}

// ─── Clipboard & Toast ───

export function copyText(text) {
  navigator.clipboard?.writeText(text).then(() => showToast('Copied'));
}

export function showToast(msg, isError = false) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const variant = isError === true ? 'error' : (isError === 'warning' ? 'warning' : '');
  const icon = variant === 'error' ? '\u2717' : variant === 'warning' ? '!' : '\u2713';

  const el = document.createElement('div');
  el.className = `toast ${variant}`;

  const iconSpan = document.createElement('span');
  iconSpan.className = 'toast-icon';
  iconSpan.textContent = icon;

  const msgSpan = document.createElement('span');
  msgSpan.className = 'toast-msg';
  msgSpan.textContent = msg;

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'toast-dismiss';
  dismissBtn.textContent = '\u00d7';
  dismissBtn.onclick = () => {
    el.classList.add('exiting');
    setTimeout(() => el.remove(), 250);
  };

  el.append(iconSpan, msgSpan, dismissBtn);
  container.appendChild(el);

  // Auto-dismiss after 3s
  setTimeout(() => {
    if (el.parentElement) {
      el.classList.add('exiting');
      setTimeout(() => el.remove(), 250);
    }
  }, 3000);

  // Cap at 4 visible toasts
  while (container.children.length > 4) {
    container.firstChild.remove();
  }
}

// Attach to window for onclick handlers
window.rotateKey = rotateKey;
window.revokeKey = revokeKey;
window.disconnectWallet = disconnectWallet;
window.toggleKeyVisibility = toggleKeyVisibility;
window.setTab = setTab;
window.copyText = copyText;
window.showToast = showToast;
