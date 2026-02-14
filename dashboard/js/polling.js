// ═══════════════════════════════════════════
// INFINITE Dashboard - Status Polling
// ═══════════════════════════════════════════

import { STATE, CHAT, setStatusPollInterval, clearStatusPollInterval } from './state.js';
import { api } from './api.js';
import { saveSession, clearSession } from './session.js';

// ─── Status Polling ───

export async function fetchStatus() {
  if (!STATE.apiKeyFull) return;
  try {
    const data = await api('/auth/status');
    STATE.tier = data.tier;
    STATE.balance = data.balance;
    STATE.usage = data.usage;
    STATE.models = data.models || STATE.models;
    if (STATE.models.length && !CHAT.selectedModel) CHAT.selectedModel = STATE.models[0];
    saveSession();
    // Only full re-render if NOT in interactive tabs
    if (!['chat', 'images', 'video', 'trading'].includes(STATE.activeTab)) {
      import('./render.js').then(m => m.render());
    } else {
      updateSidebarFooter();
    }
  } catch (err) {
    if (err.status === 401) {
      clearSession();
      import('./render.js').then(m => m.render());
    }
  }
}

export async function fetchTreasury() {
  try { STATE.treasury = await api('/treasury'); } catch {}
}

export async function fetchProviders() {
  try { STATE.providers = await api('/providers'); } catch {}
}

export async function fetchOAuthStatus() {
  try { STATE.connections = await api('/oauth/status'); } catch {}
}

export function startStatusPolling() {
  fetchStatus();
  fetchTreasury();
  fetchProviders();
  fetchOAuthStatus();
  clearStatusPollInterval();
  setStatusPollInterval(setInterval(() => { fetchStatus(); fetchTreasury(); }, 60_000));
}

export function updateSidebarFooter() {
  const el = document.getElementById('sidebarFooterInfo');
  if (el) el.textContent = `${STATE.tier || '—'} Tier — ${STATE.balance.toLocaleString()} $INF`;
}
