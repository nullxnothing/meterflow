// ═══════════════════════════════════════════
// Meterflow Dashboard - Actions
// ═══════════════════════════════════════════

import { STATE } from './state.js';
import { api } from './api.js';
import { maskKey } from './utils.js';
import { saveSession, clearSession } from './session.js';
import { render, switchTabInPlace } from './render.js';

const DASHBOARD_TABS = new Set([
  'overview', 'meters', 'receipts', 'budgets', 'mcp-tools', 'webhooks',
  'keys', 'holder-tools', 'treasury', 'future-apis',
]);

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
  if (!DASHBOARD_TABS.has(tab)) tab = 'overview';
  // Sync URL hash for deep-linking, refresh persistence, and back-button support
  if (typeof history !== 'undefined' && location.hash !== '#' + tab) {
    history.pushState({ tab }, '', '#' + tab);
  }
  // Fast path: only re-render <main> + nav highlights, keep sidebar intact
  if (switchTabInPlace(tab)) return;
  // Fallback: full re-render
  STATE.activeTab = tab;
  render();
}

// ─── Clipboard & Toast ───

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied');
  } catch {
    showToast('Copy failed — please copy manually', true);
  }
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

  // Auto-dismiss: errors stay longer (6s), success/warning auto-dismiss (3s)
  const dismissMs = variant === 'error' ? 6000 : 3000;
  setTimeout(() => {
    if (el.parentElement) {
      el.classList.add('exiting');
      setTimeout(() => el.remove(), 250);
    }
  }, dismissMs);

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
