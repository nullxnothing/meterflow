// Infinite Alpha — Twitter/X content script
// Injects profile intelligence overlay on Twitter profile pages

(() => {
  const PANEL_ID = 'infinite-alpha-panel';
  const SCAN_DEBOUNCE = 800;
  let currentUsername = null;
  let scanTimer = null;

  // ── URL parsing ──

  function getUsernameFromURL() {
    const path = window.location.pathname;
    const match = path.match(/^\/([a-zA-Z0-9_]{1,15})$/);
    if (!match) return null;

    const reserved = [
      'home', 'explore', 'search', 'notifications', 'messages',
      'settings', 'i', 'compose', 'intent', 'hashtag', 'lists',
    ];
    const username = match[1];
    return reserved.includes(username.toLowerCase()) ? null : username;
  }

  // ── Panel rendering ──

  function createPanel() {
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'oc-panel';
    panel.innerHTML = `
      <div class="oc-header">
        <span class="oc-header-dot"></span>
        Infinite Alpha
      </div>
      <div class="oc-loading">
        <div class="oc-spinner"></div>
        Scanning profile...
      </div>
    `;
    return panel;
  }

  function renderData(panel, data) {
    const { profile, renameHistory, keyFollowers, keyFollowerCount, contractAddresses, isKeyProfile } = data;
    let html = `
      <div class="oc-header">
        <span class="oc-header-dot"></span>
        Infinite Alpha
        ${isKeyProfile ? '<span class="oc-key-badge">KEY PROFILE</span>' : ''}
      </div>
    `;

    // Rename history
    if (renameHistory?.length) {
      html += `<div class="oc-section">
        <div class="oc-section-title">Rename History (${renameHistory.length})</div>
        <div class="oc-renames">`;
      for (const entry of renameHistory.slice(0, 10)) {
        html += `<span class="oc-rename-badge">
          ${escapeHtml(entry.from)} <span class="oc-rename-arrow">&rarr;</span> ${escapeHtml(entry.to)}
        </span>`;
      }
      html += '</div></div>';
    }

    // Key followers
    if (keyFollowers?.length) {
      html += `<div class="oc-section">
        <div class="oc-section-title">Key Followers (${keyFollowerCount || keyFollowers.length})</div>
        <div class="oc-kf-list">`;
      for (const kf of keyFollowers.slice(0, 12)) {
        const img = kf.profileImage
          ? `<img class="oc-kf-avatar" src="${escapeHtml(kf.profileImage)}" alt="">`
          : '';
        html += `<a class="oc-kf-item" href="https://x.com/${escapeHtml(kf.username || '')}" target="_blank">
          ${img}
          <span class="oc-kf-name">@${escapeHtml(kf.username || kf.twitterId)}</span>
          ${kf.category ? `<span class="oc-kf-category">${escapeHtml(kf.category)}</span>` : ''}
        </a>`;
      }
      if (keyFollowerCount > 12) {
        html += `<span class="oc-kf-count">+${keyFollowerCount - 12} more</span>`;
      }
      html += '</div></div>';
    }

    // Contract addresses
    if (contractAddresses?.length) {
      html += `<div class="oc-section">
        <div class="oc-section-title">Contract Addresses (${contractAddresses.length})</div>
        <div class="oc-ca-list">`;
      for (const ca of contractAddresses.slice(0, 5)) {
        const short = ca.contractAddress.slice(0, 6) + '...' + ca.contractAddress.slice(-4);
        html += `<div class="oc-ca-item" data-ca="${escapeHtml(ca.contractAddress)}" title="${escapeHtml(ca.contractAddress)}">
          <span class="oc-ca-addr">${short}</span>
          <span style="color:#71767b;font-size:10px">${escapeHtml(ca.postedBy || '')}</span>
        </div>`;
      }
      html += '</div></div>';
    }

    // No data state
    if (!renameHistory?.length && !keyFollowers?.length && !contractAddresses?.length) {
      html += '<div style="color:#71767b;font-size:12px">No intelligence data yet for this profile.</div>';
    }

    // Notes section
    html += `<div class="oc-section">
      <div class="oc-section-title">Notes</div>
      <textarea class="oc-note-input" placeholder="Add a private note about this project..." data-twitter-id="${escapeHtml(profile?.twitterId || '')}"></textarea>
    </div>`;

    panel.innerHTML = html;

    // Wire up CA click to copy
    panel.querySelectorAll('.oc-ca-item').forEach(el => {
      el.addEventListener('click', () => {
        navigator.clipboard.writeText(el.dataset.ca);
        el.style.borderColor = 'rgba(0, 186, 124, 0.6)';
        setTimeout(() => { el.style.borderColor = ''; }, 1000);
      });
    });

    // Wire up notes
    const noteInput = panel.querySelector('.oc-note-input');
    if (noteInput) {
      // Load existing note
      const twitterId = noteInput.dataset.twitterId;
      if (twitterId) {
        chrome.runtime.sendMessage({ type: 'GET_NOTE', twitterId }, (res) => {
          if (res?.success && res.data?.note?.text) {
            noteInput.value = res.data.note.text;
          }
        });
      }

      let saveTimer = null;
      noteInput.addEventListener('input', () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          const tid = noteInput.dataset.twitterId;
          if (tid && noteInput.value.trim()) {
            chrome.runtime.sendMessage({ type: 'SAVE_NOTE', twitterId: tid, text: noteInput.value });
          }
        }, 1500);
      });
    }
  }

  function renderError(panel, message) {
    panel.innerHTML = `
      <div class="oc-header">
        <span class="oc-header-dot"></span>
        Infinite Alpha
      </div>
      <div class="oc-error">${escapeHtml(message)}</div>
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Injection logic ──

  function findBioElement() {
    // Twitter profile bio is inside [data-testid="UserDescription"]
    // We inject our panel after the bio section
    return document.querySelector('[data-testid="UserDescription"]')
      || document.querySelector('[data-testid="UserProfileHeader_Items"]');
  }

  function injectPanel(username) {
    // Remove existing panel
    const existing = document.getElementById(PANEL_ID);
    if (existing) existing.remove();

    const anchor = findBioElement();
    if (!anchor) return;

    const panel = createPanel();
    anchor.parentElement.insertBefore(panel, anchor.nextSibling);

    // Fetch data
    chrome.runtime.sendMessage({ type: 'SCAN_PROFILE', username }, (response) => {
      if (chrome.runtime.lastError) {
        renderError(panel, 'Extension error — try refreshing');
        return;
      }
      if (!response?.success) {
        if (response?.error === 'not_authenticated') {
          renderError(panel, 'Connect your Infinite Keys API key in the extension popup');
        } else {
          renderError(panel, response?.error || 'Scan failed');
        }
        return;
      }
      renderData(panel, response.data);
    });
  }

  function removePanel() {
    const existing = document.getElementById(PANEL_ID);
    if (existing) existing.remove();
  }

  // ── Profile detection ──

  function checkAndScan() {
    const username = getUsernameFromURL();

    if (!username) {
      if (currentUsername) {
        removePanel();
        currentUsername = null;
      }
      return;
    }

    if (username === currentUsername) {
      // Same profile, check if panel still exists (Twitter might have removed it)
      if (!document.getElementById(PANEL_ID)) {
        injectPanel(username);
      }
      return;
    }

    currentUsername = username;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => injectPanel(username), SCAN_DEBOUNCE);
  }

  // ── Observers ──

  // Watch for SPA navigation (Twitter is an SPA)
  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      checkAndScan();
    }
  });
  urlObserver.observe(document.body, { childList: true, subtree: true });

  // Watch for DOM changes (profile content loading)
  const domObserver = new MutationObserver(() => {
    if (getUsernameFromURL() && !document.getElementById(PANEL_ID) && findBioElement()) {
      checkAndScan();
    }
  });
  domObserver.observe(document.body, { childList: true, subtree: true });

  // Listen for navigation events from service worker
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'scanProfile') {
      checkAndScan();
    }
  });

  // Initial scan
  setTimeout(checkAndScan, 1000);

  console.log('[Infinite Alpha] Content script loaded');
})();
