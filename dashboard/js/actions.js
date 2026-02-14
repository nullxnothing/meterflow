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
  try {
    const data = await api('/auth/rotate', { method: 'POST' });
    STATE.apiKeyFull = data.apiKey;
    STATE.apiKey = maskKey(data.apiKey);
    STATE.tier = data.tier;
    STATE.keyVisible = false;
    saveSession();
    showToast('Key rotated');
  } catch (err) {
    showToast(err.message || 'Rotate failed', true);
  }
  render();
}

export async function revokeKey() {
  if (!confirm('Revoke your API key? All active sessions will be terminated.')) return;
  try { await api('/auth/revoke', { method: 'POST' }); showToast('Key revoked'); } catch {}
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
  document.getElementById('toast')?.remove();
  const el = document.createElement('div');
  el.id = 'toast';
  el.style.cssText = `position:fixed;bottom:24px;right:24px;padding:12px 20px;font-family:var(--font-mono);font-size:11px;letter-spacing:1px;z-index:10000;border:1px solid ${isError ? 'var(--red)' : 'var(--accent)'};color:${isError ? 'var(--red)' : 'var(--accent)'};background:var(--surface);`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// Attach to window for onclick handlers
window.rotateKey = rotateKey;
window.revokeKey = revokeKey;
window.disconnectWallet = disconnectWallet;
window.toggleKeyVisibility = toggleKeyVisibility;
window.setTab = setTab;
window.copyText = copyText;
window.showToast = showToast;
