// ═══════════════════════════════════════════
// INFINITE Dashboard - Entry Point
// ═══════════════════════════════════════════

import { STATE, CHAT, TRADING } from './state.js';
import { loadSession, loadChatHistory, loadVideoHistory } from './session.js';
import { loadTradingHistory } from './tabs/trading.js';
import { startStatusPolling, fetchAggregate, fetchTreasury, fetchProviders, fetchOAuthStatus, fetchProviderStatuses } from './polling.js';
import { render } from './render.js';
import { showToast } from './actions.js';
import { loadVotes } from './votes.js';

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
  // Public/non-holder — fetch public data only (prefer aggregate, fallback to individual)
  fetchAggregate().then(ok => {
    if (!ok) { fetchTreasury(); fetchProviders(); }
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
