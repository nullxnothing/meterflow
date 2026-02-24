// Infinite Alpha — popup script

const authSection = document.getElementById('auth-section');
const connectedSection = document.getElementById('connected-section');
const apiKeyInput = document.getElementById('api-key-input');
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const sidepanelBtn = document.getElementById('sidepanel-btn');
const statsEl = document.getElementById('stats');

function showAuth() {
  authSection.classList.remove('hidden');
  connectedSection.classList.add('hidden');
}

function showConnected() {
  authSection.classList.add('hidden');
  connectedSection.classList.remove('hidden');
  loadStats();
}

async function loadStats() {
  chrome.runtime.sendMessage({ type: 'GET_STATS' }, (res) => {
    if (res?.success && res.data) {
      statsEl.innerHTML = `
        <strong>${res.data.keyProfileCount || 0}</strong> key profiles tracked
      `;
    } else {
      statsEl.textContent = 'Stats unavailable';
    }
  });
}

// Check current auth state
chrome.runtime.sendMessage({ type: 'CHECK_AUTH' }, (res) => {
  if (res?.authenticated) {
    showConnected();
  } else {
    showAuth();
  }
});

// Connect
connectBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;

  connectBtn.textContent = 'Connecting...';
  connectBtn.disabled = true;

  chrome.runtime.sendMessage({ type: 'SET_API_KEY', apiKey: key }, (res) => {
    if (res?.success) {
      showConnected();
    } else {
      connectBtn.textContent = 'Connect';
      connectBtn.disabled = false;
      alert('Failed to save API key');
    }
  });
});

// Disconnect
disconnectBtn.addEventListener('click', () => {
  chrome.storage.local.remove('apiKey', () => {
    showAuth();
    apiKeyInput.value = '';
  });
});

// Open side panel
sidepanelBtn.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  } catch {
    // Fallback — some browsers don't support programmatic sidePanel.open
  }
});

// Enter to connect
apiKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') connectBtn.click();
});
