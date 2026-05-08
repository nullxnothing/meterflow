// Meterflow Signal — API client for Chrome extension
const API_BASE = 'https://meterflow.fun/proxy';

async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  return apiKey || null;
}

async function setApiKey(key) {
  await chrome.storage.local.set({ apiKey: key });
}

async function apiFetch(path, options = {}) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('not_authenticated');

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'unknown' }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// ── Signal API methods ──

async function scanProfile(username) {
  return apiFetch(`/v1/alpha/profile/${encodeURIComponent(username)}`);
}

async function getParents(twitterId, limit = 20) {
  return apiFetch(`/v1/alpha/profile/${twitterId}/parents?limit=${limit}`);
}

async function getChildren(twitterId, limit = 50) {
  return apiFetch(`/v1/alpha/profile/${twitterId}/children?limit=${limit}`);
}

async function getDiscover(limit = 50) {
  return apiFetch(`/v1/alpha/discover?limit=${limit}`);
}

async function getTrending(limit = 50) {
  return apiFetch(`/v1/alpha/trending?limit=${limit}`);
}

async function getAlerts(twitterId, limit = 50) {
  return apiFetch(`/v1/alpha/alerts/${twitterId}?limit=${limit}`);
}

async function getCAs(twitterId) {
  return apiFetch(`/v1/alpha/ca/${twitterId}`);
}

async function scanToken(address) {
  return apiFetch(`/v1/alpha/scan-token/${address}`);
}

async function getNote(twitterId) {
  return apiFetch(`/v1/alpha/notes/${twitterId}`);
}

async function saveNote(twitterId, text) {
  return apiFetch(`/v1/alpha/notes/${twitterId}`, {
    method: 'PUT',
    body: JSON.stringify({ text }),
  });
}

async function deleteNote(twitterId) {
  return apiFetch(`/v1/alpha/notes/${twitterId}`, { method: 'DELETE' });
}

async function getStats() {
  return apiFetch('/v1/alpha/stats');
}

async function getWatchlist() {
  return apiFetch('/v1/alpha/watchlist');
}

async function addToWatchlist(username) {
  return apiFetch('/v1/alpha/watchlist', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
}

async function removeFromWatchlist(twitterId) {
  return apiFetch(`/v1/alpha/watchlist/${twitterId}`, { method: 'DELETE' });
}

// Export for use in other extension scripts via chrome.runtime.sendMessage
if (typeof globalThis !== 'undefined') {
  globalThis.MeterflowAlphaAPI = {
    getApiKey, setApiKey, apiFetch,
    scanProfile, getParents, getChildren,
    getDiscover, getTrending, getAlerts, getCAs,
    scanToken, getNote, saveNote, deleteNote, getStats,
    getWatchlist, addToWatchlist, removeFromWatchlist,
  };
}
