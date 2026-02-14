// ═══════════════════════════════════════════
// INFINITE Dashboard - Votes Management
// ═══════════════════════════════════════════

import { STATE, VOTES } from './state.js';
import { api } from './api.js';
import { render } from './render.js';

export async function loadVotes() {
  try {
    const data = await api('/votes');
    VOTES.voteCounts = data.counts || {};
    VOTES.userVotes = new Set(data.userVotes || []);
    render();
  } catch (e) { console.error('Failed to load votes:', e); }
}

export async function toggleVote(apiId) {
  if (!STATE.connected) {
    STATE.error = 'Connect your wallet to vote';
    render();
    return;
  }
  try {
    const data = await api('/votes', { method: 'POST', body: JSON.stringify({ apiId }) });
    VOTES.voteCounts = data.counts || {};
    VOTES.userVotes = new Set(data.userVotes || []);
    render();
  } catch (e) {
    console.error('Failed to toggle vote:', e);
    STATE.error = e.message || 'Failed to vote';
    render();
  }
}

// Attach to window for onclick handlers
window.toggleVote = toggleVote;
