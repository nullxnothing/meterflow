// Infinite Alpha — service worker (background script)
importScripts('lib/api.js');

const API = globalThis.InfiniteAlphaAPI;

// ── Message handler — relay API calls from content scripts ──

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg.type) return false;

  switch (msg.type) {
    case 'SCAN_PROFILE':
      API.scanProfile(msg.username)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_PARENTS':
      API.getParents(msg.twitterId, msg.limit)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'SCAN_TOKEN':
      API.scanToken(msg.address)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_NOTE':
      API.getNote(msg.twitterId)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'SAVE_NOTE':
      API.saveNote(msg.twitterId, msg.text)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_DISCOVER':
      API.getDiscover(msg.limit)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_TRENDING':
      API.getTrending(msg.limit)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_ALERTS':
      API.getAlerts(msg.twitterId, msg.limit)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'CHECK_AUTH':
      API.getApiKey()
        .then(key => sendResponse({ authenticated: !!key }))
        .catch(() => sendResponse({ authenticated: false }));
      return true;

    case 'SET_API_KEY':
      API.setApiKey(msg.apiKey)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_STATS':
      API.getStats()
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_WATCHLIST':
      API.getWatchlist()
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'ADD_WATCHLIST':
      API.addToWatchlist(msg.username)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'REMOVE_WATCHLIST':
      API.removeFromWatchlist(msg.twitterId)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
  }

  return false;
});

// ── Tab update listener — notify content scripts to re-scan on navigation ──

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.match(/https:\/\/(x\.com|twitter\.com)\//)) {
    chrome.tabs.sendMessage(tabId, { action: 'scanProfile' }).catch(() => {});
  }
});

// ── Side panel open on extension click ──

chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false }).catch(() => {});

console.log('[Infinite Alpha] Service worker started');
