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
    STATE.balance = data.balance ?? 0;
    STATE.usage = data.usage || STATE.usage;
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
    if (err.status === 401 || err.status === 403) {
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
  if (el) el.textContent = `${STATE.tier || '—'} Tier \u2014 ${(STATE.balance ?? 0).toLocaleString()} $INF`;

  // Update sidebar usage bar
  const usageEl = document.getElementById('sidebarUsage');
  if (usageEl) {
    const pct = STATE.usage.limit > 0 ? Math.min((STATE.usage.today / STATE.usage.limit) * 100, 100) : 0;
    const barClass = pct > 90 ? 'danger' : pct > 70 ? 'warning' : '';
    const fill = usageEl.querySelector('.sidebar-usage-fill');
    const count = usageEl.querySelector('.sidebar-usage-count');
    if (fill) { fill.style.width = `${pct}%`; fill.className = `sidebar-usage-fill ${barClass}`; }
    if (count) count.textContent = `${STATE.usage.remaining.toLocaleString()} left`;
  }

  // Update connection dot
  const dot = document.getElementById('connectionDot');
  if (dot) {
    dot.className = `status-dot ${STATE.apiKeyFull ? 'online' : 'offline'}`;
    dot.title = STATE.apiKeyFull ? 'Connected' : 'Disconnected';
  }
}
