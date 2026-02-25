import {
  STATE, CHAT,
  setStatusPollInterval, clearStatusPollInterval,
  setProviderStatusInterval, clearProviderStatusInterval,
} from './state.js';
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
  try { STATE.treasury = await api('/treasury'); } catch (err) {
    console.warn('fetchTreasury failed:', err.message || err);
  }
}

export async function fetchProviders() {
  try { STATE.providers = await api('/providers'); } catch (err) {
    console.warn('fetchProviders failed:', err.message || err);
  }
}

export async function fetchOAuthStatus() {
  try { STATE.connections = await api('/oauth/status'); } catch (err) {
    console.warn('fetchOAuthStatus failed:', err.message || err);
  }
}

// ─── Provider Status Pages ───

const STATUS_PAGES = [
  { key: 'claude', url: 'https://status.claude.com/api/v2/summary.json', apiName: 'Claude API' },
  { key: 'openai', url: 'https://status.openai.com/api/v2/summary.json', apiName: 'API' },
];

export async function fetchProviderStatuses() {
  const results = await Promise.allSettled(
    STATUS_PAGES.map(async ({ key, url, apiName }) => {
      const res = await fetch(url);
      const data = await res.json();
      const apiComponent = data.components?.find(c => c.name.includes(apiName));
      const incident = data.incidents?.[0];
      return {
        key,
        indicator: data.status?.indicator || 'none',
        description: data.status?.description || 'All Systems Operational',
        apiStatus: apiComponent?.status || 'operational',
        incident: incident ? { name: incident.name, status: incident.status, impact: incident.impact } : null,
      };
    })
  );

  let worstIndicator = 'none';
  let worstIncident = null;
  let worstDescription = 'All Systems Operational';
  const indicatorSeverity = { none: 0, minor: 1, major: 2, critical: 3 };

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const s = result.value;
    if (indicatorSeverity[s.indicator] > indicatorSeverity[worstIndicator]) {
      worstIndicator = s.indicator;
      worstDescription = `${s.key === 'claude' ? 'Claude' : 'OpenAI'}: ${s.description}`;
      worstIncident = s.incident;
    }
  }

  STATE.providerStatus = {
    indicator: worstIndicator,
    description: worstDescription,
    incident: worstIncident,
    details: results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value),
  };

  updateStatusBanner();
}

function updateStatusBanner() {
  const el = document.getElementById('claudeStatusBanner');
  if (!el) return;
  const s = STATE.providerStatus;
  if (!s || s.indicator === 'none') {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'flex';
  el.className = `status-banner status-banner--${s.indicator}`;
  const text = el.querySelector('.status-banner-text');
  if (text) text.textContent = s.incident ? s.incident.name : s.description;
}

// ─── Polling Lifecycle ───

export function startStatusPolling() {
  fetchStatus();
  fetchTreasury();
  fetchProviders();
  fetchOAuthStatus();
  fetchProviderStatuses();

  clearStatusPollInterval();
  clearProviderStatusInterval();

  setStatusPollInterval(setInterval(() => { fetchStatus(); fetchTreasury(); }, 60_000));
  setProviderStatusInterval(setInterval(fetchProviderStatuses, 300_000));
}

export function stopStatusPolling() {
  clearStatusPollInterval();
  clearProviderStatusInterval();
}

// ─── UI Updates ───

export function updateSidebarFooter() {
  const el = document.getElementById('sidebarFooterInfo');
  if (el) el.textContent = `${STATE.tier || '\u2014'} Tier \u2014 ${(STATE.balance ?? 0).toLocaleString()} $INF`;

  const usageEl = document.getElementById('sidebarUsage');
  if (usageEl) {
    const pct = STATE.usage.limit > 0 ? Math.min((STATE.usage.today / STATE.usage.limit) * 100, 100) : 0;
    const barClass = pct > 90 ? 'danger' : pct > 70 ? 'warning' : '';
    const fill = usageEl.querySelector('.sidebar-usage-fill');
    const count = usageEl.querySelector('.sidebar-usage-count');
    if (fill) { fill.style.width = `${pct}%`; fill.className = `sidebar-usage-fill ${barClass}`; }
    if (count) count.textContent = `${STATE.usage.remaining.toLocaleString()} left`;
  }

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

  const sub = main.querySelector('.page-sub');
  if (sub) sub.textContent = `${STATE.tier || '\u2014'} tier \u2014 ${STATE.usage.remaining.toLocaleString()} API calls remaining today`;

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

  const fill = main.querySelector('.usage-bar-fill');
  if (fill) { fill.style.width = `${usagePct}%`; fill.className = `usage-bar-fill ${barClass}`; }

  const counts = main.querySelectorAll('.usage-count');
  if (counts[0]) counts[0].innerHTML = `${STATE.usage.today.toLocaleString()} <span>/ ${STATE.usage.limit.toLocaleString()} calls</span>`;
  if (counts[1]) counts[1].textContent = `${Math.round(usagePct)}%`;
}
