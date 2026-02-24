// Infinite Alpha — side panel feed
(() => {
  const discoverFeed = document.getElementById('discover-feed');
  const trendingFeed = document.getElementById('trending-feed');
  const alertsFeed = document.getElementById('alerts-feed');
  const watchlistFeed = document.getElementById('watchlist-feed');
  const watchlistInput = document.getElementById('watchlist-input');
  const watchlistAddBtn = document.getElementById('watchlist-add-btn');
  const notConnected = document.getElementById('not-connected');
  let isAuthenticated = false;

  // ── Tab switching ──

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // ── Rendering helpers ──

  function timeAgo(ts) {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
    return `${Math.floor(sec / 86400)}d`;
  }

  function escapeHtml(str) {
    const el = document.createElement('span');
    el.textContent = str || '';
    return el.innerHTML;
  }

  function renderDiscoverItem(item) {
    const avatar = item.profileImage
      ? `<img class="feed-avatar" src="${escapeHtml(item.profileImage)}" alt="">`
      : '';

    return `<div class="feed-item" onclick="window.open('https://x.com/${escapeHtml(item.username)}','_blank')">
      <div class="feed-item-header">
        ${avatar}
        <div>
          <div class="feed-name">${escapeHtml(item.displayName || item.username)}</div>
          <div class="feed-username">@${escapeHtml(item.username)}</div>
        </div>
        <div class="feed-time">${item.detectedAt ? timeAgo(item.detectedAt) : ''}</div>
      </div>
      ${item.bio ? `<div class="feed-bio">${escapeHtml(item.bio)}</div>` : ''}
      <div class="feed-meta">
        <span class="feed-badge badge-discover">NEW</span>
        ${item.followedBy ? `<span>Followed by @${escapeHtml(item.followedBy)}</span>` : ''}
        ${item.followers ? `<span class="feed-followers">${Number(item.followers).toLocaleString()} followers</span>` : ''}
      </div>
    </div>`;
  }

  function renderTrendingItem(item, rank) {
    const avatar = item.profileImage
      ? `<img class="feed-avatar" src="${escapeHtml(item.profileImage)}" alt="">`
      : '';

    return `<div class="feed-item" onclick="window.open('https://x.com/${escapeHtml(item.username)}','_blank')">
      <div class="feed-item-header">
        ${avatar}
        <div>
          <div class="feed-name">${escapeHtml(item.displayName || item.username)}</div>
          <div class="feed-username">@${escapeHtml(item.username)}</div>
        </div>
        <div class="feed-score">#${rank + 1}</div>
      </div>
      ${item.bio ? `<div class="feed-bio">${escapeHtml(item.bio)}</div>` : ''}
      <div class="feed-meta">
        <span class="feed-badge badge-trending">${item.score || 0} key follows</span>
        ${item.followers ? `<span class="feed-followers">${Number(item.followers).toLocaleString()} followers</span>` : ''}
      </div>
    </div>`;
  }

  function renderAlertItem(alert) {
    let typeClass = 'alert-rename';
    let badge = 'RENAME';
    let detail = '';

    if (alert.type === 'rename') {
      typeClass = 'alert-rename';
      badge = 'RENAME';
      detail = `${escapeHtml(alert.from)} → ${escapeHtml(alert.to)}`;
    } else if (alert.type === 'bio_change') {
      typeClass = 'alert-bio';
      badge = 'BIO';
      detail = escapeHtml((alert.to || '').slice(0, 100));
    } else if (alert.type === 'ca_detected') {
      typeClass = 'alert-ca';
      badge = 'CA';
      detail = escapeHtml(alert.contractAddress || '');
    }

    return `<div class="feed-item ${typeClass}">
      <div class="feed-meta">
        <span class="feed-badge badge-alert">${badge}</span>
        <span>${detail}</span>
        <span class="feed-time">${alert.timestamp ? timeAgo(alert.timestamp) : ''}</span>
      </div>
    </div>`;
  }

  function showLoading(el) {
    el.innerHTML = '<div class="loading-state"><div class="spinner"></div> Loading...</div>';
  }

  function showEmpty(el, message) {
    el.innerHTML = `<div class="empty-state">${message}</div>`;
  }

  // ── Data loading ──

  function loadDiscover() {
    showLoading(discoverFeed);
    chrome.runtime.sendMessage({ type: 'GET_DISCOVER', limit: 50 }, (res) => {
      if (!res?.success || !res.data?.projects?.length) {
        showEmpty(discoverFeed, 'No discoveries yet.<br>The pipeline is scanning key profiles — check back soon.');
        return;
      }
      discoverFeed.innerHTML = res.data.projects.map(renderDiscoverItem).join('');
    });
  }

  function loadTrending() {
    showLoading(trendingFeed);
    chrome.runtime.sendMessage({ type: 'GET_TRENDING', limit: 50 }, (res) => {
      if (!res?.success || !res.data?.projects?.length) {
        showEmpty(trendingFeed, 'No trending data yet.<br>Trending scores update every 10 minutes.');
        return;
      }
      trendingFeed.innerHTML = res.data.projects.map(renderTrendingItem).join('');
    });
  }

  function loadAlerts() {
    showLoading(alertsFeed);
    // Load alerts from watched profiles
    chrome.runtime.sendMessage({ type: 'GET_WATCHLIST' }, (wlRes) => {
      if (!wlRes?.success || !wlRes.data?.profiles?.length) {
        showEmpty(alertsFeed, 'Add accounts to your watchlist to see alerts here.');
        return;
      }
      // Fetch alerts for each watched profile and merge
      const profiles = wlRes.data.profiles;
      let pending = profiles.length;
      let allAlerts = [];
      if (!pending) { showEmpty(alertsFeed, 'No alerts yet.'); return; }
      profiles.forEach(p => {
        chrome.runtime.sendMessage({ type: 'GET_ALERTS', twitterId: p.twitterId, limit: 10 }, (res) => {
          if (res?.success && res.data?.alerts?.length) {
            allAlerts = allAlerts.concat(res.data.alerts);
          }
          pending--;
          if (pending <= 0) {
            if (!allAlerts.length) {
              showEmpty(alertsFeed, 'No alerts yet.<br>Alerts fire when watched profiles rename, change bio, or post CAs.');
              return;
            }
            allAlerts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            alertsFeed.innerHTML = allAlerts.slice(0, 50).map(renderAlertItem).join('');
          }
        });
      });
    });
  }

  // ── Watchlist ──

  function loadWatchlist() {
    showLoading(watchlistFeed);
    chrome.runtime.sendMessage({ type: 'GET_WATCHLIST' }, (res) => {
      if (!res?.success || !res.data?.profiles?.length) {
        showEmpty(watchlistFeed, 'No accounts tracked yet.<br>Add any @username above to start monitoring.');
        return;
      }
      watchlistFeed.innerHTML = res.data.profiles.map(renderWatchlistItem).join('');
      // Bind remove buttons
      watchlistFeed.querySelectorAll('.watchlist-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const tid = btn.dataset.id;
          btn.disabled = true;
          btn.textContent = '...';
          chrome.runtime.sendMessage({ type: 'REMOVE_WATCHLIST', twitterId: tid }, () => loadWatchlist());
        });
      });
    });
  }

  function renderWatchlistItem(item) {
    const avatar = item.profileImage
      ? `<img class="feed-avatar" src="${escapeHtml(item.profileImage)}" alt="">`
      : '';
    return `<div class="watchlist-item">
      ${avatar}
      <div class="watchlist-item-info" onclick="window.open('https://x.com/${escapeHtml(item.username)}','_blank')">
        <div class="watchlist-item-name">${escapeHtml(item.displayName || item.username)}</div>
        <div class="watchlist-item-handle">@${escapeHtml(item.username)}</div>
      </div>
      <button class="watchlist-remove" data-id="${escapeHtml(item.twitterId)}">Remove</button>
    </div>`;
  }

  watchlistAddBtn.addEventListener('click', () => {
    const username = watchlistInput.value.trim().replace(/^@/, '');
    if (!username) return;
    watchlistAddBtn.disabled = true;
    watchlistAddBtn.textContent = '...';
    chrome.runtime.sendMessage({ type: 'ADD_WATCHLIST', username }, (res) => {
      watchlistAddBtn.disabled = false;
      watchlistAddBtn.textContent = 'Track';
      watchlistInput.value = '';
      if (res?.success) {
        loadWatchlist();
      } else {
        watchlistInput.value = username;
        watchlistInput.style.borderColor = '#ff6b6b';
        setTimeout(() => { watchlistInput.style.borderColor = ''; }, 1500);
      }
    });
  });

  watchlistInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') watchlistAddBtn.click();
  });

  // ── Init ──

  chrome.runtime.sendMessage({ type: 'CHECK_AUTH' }, (res) => {
    if (res?.authenticated) {
      isAuthenticated = true;
      notConnected.classList.add('hidden');
      loadDiscover();
      loadTrending();
      loadWatchlist();
      loadAlerts();
    } else {
      notConnected.classList.remove('hidden');
    }
  });

  // Auto-refresh every 60s
  setInterval(() => {
    if (!isAuthenticated) return;
    const activeTab = document.querySelector('.tab.active')?.dataset.tab;
    if (activeTab === 'discover') loadDiscover();
    if (activeTab === 'trending') loadTrending();
  }, 60_000);
})();
