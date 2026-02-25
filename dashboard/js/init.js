// ═══════════════════════════════════════════
// INFINITE Dashboard - Entry Point
// ═══════════════════════════════════════════

import { STATE, CHAT, TRADING, API_BASE } from './state.js';
import { loadSession, loadChatHistory, loadVideoHistory } from './session.js';
import { loadTradingHistory } from './tabs/trading.js';
import { startStatusPolling, fetchAggregate, fetchTreasury, fetchProviders, fetchOAuthStatus, fetchProviderStatuses } from './polling.js';
import { render } from './render.js';
import { showToast } from './actions.js';
import { loadVotes } from './votes.js';
import { maskKey } from './api.js';
import { saveSession } from './session.js';

// ─── Initialize ───

loadChatHistory();
loadVideoHistory();
loadTradingHistory();
loadVotes();

const hasSession = loadSession();

if (hasSession) {
  // Holder session — start full polling (status, treasury, providers, oauth)
  if (STATE.models.length && !CHAT.selectedModel) CHAT.selectedModel = STATE.models[0];
  if (STATE.models.length && !TRADING.selectedModel) TRADING.selectedModel = STATE.models[0];
  startStatusPolling();
} else {
  // Check if free access is active — auto-provision guest key
  fetchAggregate().then(async (data) => {
    if (!data) { fetchTreasury(); fetchProviders(); }

    // If free access is active and user has no session, get a guest key
    const freeEndsAt = data?.freeAccessEndsAt;
    if (!freeEndsAt) return;
    if (Date.now() >= new Date(freeEndsAt).getTime()) return;

    try {
      const res = await fetch(`${API_BASE}/auth/guest`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) return;
      const data = await res.json();

      STATE.connected = true;
      STATE.isGuest = true;
      STATE.apiKeyFull = data.apiKey;
      STATE.apiKey = maskKey(data.apiKey);
      STATE.tier = data.tier;
      STATE.balance = 0;
      STATE.models = data.models || [];
      STATE.usage = { today: 0, limit: data.dailyLimit || 0, remaining: data.dailyLimit || 0 };
      STATE.freeAccess = true;
      STATE.freeAccessEndsAt = data.freeAccessEndsAt;

      if (STATE.models.length && !CHAT.selectedModel) CHAT.selectedModel = STATE.models[0];

      saveSession();
      startStatusPolling();
      render();
      showToast('Free access activated! No wallet needed. Try the AI tools.');
    } catch { /* silent — fall through to normal public view */ }
  });
  fetchProviderStatuses();
}

// ─── Handle OAuth Redirects ───

const urlParams = new URLSearchParams(window.location.search);
const connectedProvider = urlParams.get('connected');
const oauthError = urlParams.get('oauth_error');

if (connectedProvider) {
  STATE.connections[connectedProvider] = true;
  STATE.activeTab = 'connections';
  showToast(`${connectedProvider} connected successfully`);
  fetchOAuthStatus();
  window.history.replaceState({}, '', '/dashboard');
} else if (oauthError) {
  showToast(`OAuth error: ${oauthError}`, true);
  window.history.replaceState({}, '', '/dashboard');
}

// ─── Initial Render ───

render();
