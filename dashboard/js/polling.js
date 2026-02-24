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
    updateSidebarFooter();
    if (STATE.activeTab === 'overview') updateOverviewStats();
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

export async function fetchTrialStatus() {
  try {
    const data = await api('/auth/trial');
    STATE.trial = { ...data, loaded: true };
  } catch {
    STATE.trial = { used: 0, limit: 3, remaining: 3, loaded: true };
  }
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

function updateOverviewStats() {
  const main = document.querySelector('.main');
  if (!main) return;

  const usagePct = STATE.usage.limit > 0 ? (STATE.usage.today / STATE.usage.limit) * 100 : 0;
  const barClass = usagePct > 90 ? 'danger' : usagePct > 70 ? 'warning' : '';

  // Page subtitle
  const sub = main.querySelector('.page-sub');
  if (sub) sub.textContent = `${STATE.tier || '\u2014'} tier \u2014 ${STATE.usage.remaining.toLocaleString()} API calls remaining today`;

  // Stat cards (tier, calls, models, cost)
  const cards = main.querySelectorAll('.stat-card');
  if (cards.length >= 3) {
    const tierVal = cards[0].querySelector('.value');
    const tierSub = cards[0].querySelector('.sub');
    if (tierVal) tierVal.textContent = STATE.tier || '\u2014';
    if (tierSub) tierSub.textContent = `${(STATE.balance ?? 0).toLocaleString()} $INFINITE`;

    const callsVal = cards[1].querySelector('.value');
    const callsSub = cards[1].querySelector('.sub');
    if (callsVal) callsVal.textContent = STATE.usage.today.toLocaleString();
    if (callsSub) callsSub.textContent = `of ${STATE.usage.limit.toLocaleString()} limit`;

    const modelsVal = cards[2].querySelector('.value');
    if (modelsVal) modelsVal.textContent = STATE.models.length;
  }

  // Usage bar
  const fill = main.querySelector('.usage-bar-fill');
  if (fill) { fill.style.width = `${usagePct}%`; fill.className = `usage-bar-fill ${barClass}`; }

  const counts = main.querySelectorAll('.usage-count');
  if (counts[0]) counts[0].innerHTML = `${STATE.usage.today.toLocaleString()} <span>/ ${STATE.usage.limit.toLocaleString()} calls</span>`;
  if (counts[1]) counts[1].textContent = `${Math.round(usagePct)}%`;
}
