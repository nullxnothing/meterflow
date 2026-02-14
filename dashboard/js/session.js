// ═══════════════════════════════════════════
// INFINITE Dashboard - Session Persistence
// ═══════════════════════════════════════════

import { STATE, CHAT, VIDEOS, TRADING, STORAGE_KEY, CHAT_STORAGE_KEY, clearStatusPollInterval } from './state.js';
import { maskKey } from './api.js';

// ─── Session Persistence ───

export function saveSession() {
  if (!STATE.connected) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    wallet: STATE.wallet,
    apiKey: STATE.apiKeyFull,
    tier: STATE.tier,
    balance: STATE.balance,
    models: STATE.models,
  }));
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved.wallet || !saved.apiKey) return false;
    STATE.wallet = saved.wallet;
    STATE.apiKeyFull = saved.apiKey;
    STATE.apiKey = maskKey(saved.apiKey);
    STATE.tier = saved.tier;
    STATE.balance = saved.balance;
    STATE.models = saved.models || [];
    STATE.connected = true;
    return true;
  } catch { return false; }
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
  clearStatusPollInterval();
  Object.assign(STATE, {
    connected: false, connecting: false, wallet: null, walletProvider: null,
    apiKey: null, apiKeyFull: null, tier: null, balance: 0,
    usage: { today: 0, limit: 0, remaining: 0 }, models: [], keyVisible: false, error: null,
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
      // Strip base64 image data from localStorage (too large)
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
    // Import dynamically to avoid circular dependency
    import('./render.js').then(m => m.render());
  }
}

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

// ─── Trading Persistence ───

export function saveTradingHistory() {
  try {
    const toSave = TRADING.conversations.slice(-10).map(c => ({
      id: c.id,
      messages: c.messages.slice(-50),
    }));
    localStorage.setItem('infinite_trading', JSON.stringify({ conversations: toSave, activeId: TRADING.activeId }));
  } catch {}
}

export function loadTradingHistory() {
  try {
    const raw = localStorage.getItem('infinite_trading');
    if (!raw) return;
    const data = JSON.parse(raw);
    TRADING.conversations = data.conversations || [];
    TRADING.activeId = data.activeId;
  } catch {}
}
