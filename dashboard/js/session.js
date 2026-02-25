// ═══════════════════════════════════════════
// INFINITE Dashboard — Session Persistence
// ═══════════════════════════════════════════

import { STATE, CHAT, VIDEOS, TRADING, STORAGE_KEY, CHAT_STORAGE_KEY, clearStatusPollInterval } from './state.js';
import { maskKey } from './api.js';

// ─── Session Persistence ───

export function saveSession() {
  if (!STATE.connected) return;
  // Non-sensitive session data persists across tabs
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    wallet: STATE.wallet,
    tier: STATE.tier,
    balance: STATE.balance,
    models: STATE.models,
    isGuest: STATE.isGuest || false,
  }));
  // API key in sessionStorage — cleared when tab closes
  if (STATE.apiKeyFull) {
    sessionStorage.setItem('infinite_apiKey', STATE.apiKeyFull);
  }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    // Guest sessions without a wallet are valid
    if (!saved.wallet && !saved.isGuest) return false;
    STATE.wallet = saved.wallet;
    STATE.connected = true;
    STATE.isGuest = saved.isGuest || false;
    STATE.balance = saved.balance ?? 0;
    // Restore API key from sessionStorage (tab-scoped)
    const apiKey = saved.apiKey || sessionStorage.getItem('infinite_apiKey');
    if (apiKey) {
      STATE.apiKeyFull = apiKey;
      STATE.apiKey = maskKey(apiKey);
      STATE.tier = saved.tier;
      STATE.models = saved.models || [];
      // Migrate: if key was in localStorage, move it to sessionStorage
      if (saved.apiKey) {
        sessionStorage.setItem('infinite_apiKey', apiKey);
        const migrated = { ...saved };
        delete migrated.apiKey;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      }
      return true;
    }
    // Connected but not a holder — no API key
    return false;
  } catch { return false; }
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem('infinite_apiKey');
  clearStatusPollInterval();
  Object.assign(STATE, {
    connected: false, connecting: false, wallet: null, walletProvider: null,
    apiKey: null, apiKeyFull: null, tier: null, balance: 0,
    usage: { today: 0, limit: 0, remaining: 0 }, models: [], keyVisible: false, error: null,
    isGuest: false, freeAccess: false, freeAccessEndsAt: null,
  });
}

// ─── Chat Persistence ───

export function saveChatHistory() {
  const toSave = CHAT.conversations.slice(-30).map(c => ({
    id: c.id, title: c.title,
    messages: c.messages.slice(-100).map(m => {
      const saved = { role: m.role, content: m.content };
      if (m.model) saved.model = m.model;
      if (m.sources) saved.sources = m.sources;
      if (m.images) saved.hasImages = true;
      return saved;
    }),
  }));
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({ conversations: toSave, activeId: CHAT.activeId }));
  } catch { /* storage full */ }
}

export function loadChatHistory() {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    CHAT.conversations = data.conversations || [];
    CHAT.activeId = data.activeId;
  } catch {}
}

export function getActiveConversation() {
  if (!CHAT.activeId) {
    newConversation(false);
  }
  return CHAT.conversations.find(c => c.id === CHAT.activeId);
}

export function newConversation(doRender = true) {
  const conv = {
    id: 'conv_' + Date.now(),
    title: 'New chat',
    messages: [],
  };
  CHAT.conversations.push(conv);
  CHAT.activeId = conv.id;
  if (doRender) {
    import('./render.js').then(m => m.render());
  }
}

window.newConversation = newConversation;

// ─── Video Persistence ───

export function saveVideoHistory() {
  try {
    const toSave = VIDEOS.gallery
      .filter(v => v.status === 'complete' && v.uri)
      .slice(0, 20)
      .map(v => ({ prompt: v.prompt, uri: v.uri, status: v.status, createdAt: v.createdAt }));
    localStorage.setItem('infinite_videos', JSON.stringify(toSave));
  } catch {}
}

export function loadVideoHistory() {
  try {
    const raw = localStorage.getItem('infinite_videos');
    if (!raw) return;
    const data = JSON.parse(raw);
    VIDEOS.gallery = (data || []).filter(v => v.uri);
  } catch {}
}
