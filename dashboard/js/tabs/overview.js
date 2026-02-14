// ═══════════════════════════════════════════
// INFINITE Dashboard - Tab: Overview
// ═══════════════════════════════════════════

import { STATE } from '../state.js';
import { escapeHtml } from '../api.js';

function hasAnyChatProvider() {
  return STATE.providers.claude || STATE.providers.gemini || STATE.providers.openai;
}

function isVideoTierAllowed() {
  const t = (STATE.tier || '').toLowerCase();
  return t === 'operator' || t === 'architect';
}

export function renderOverview() {
  const usagePct = STATE.usage.limit > 0 ? (STATE.usage.today / STATE.usage.limit) * 100 : 0;
  const barClass = usagePct > 90 ? 'danger' : usagePct > 70 ? 'warning' : '';
  return `
    <div class="page-header">
      <h1 class="page-title">Welcome back</h1>
      <p class="page-sub">${STATE.tier || '—'} tier — ${STATE.usage.remaining.toLocaleString()} API calls remaining today</p>
    </div>
    <div class="stats-row">
      <div class="stat-card"><div class="label">Your Tier</div><div class="value accent">${STATE.tier || '—'}</div><div class="sub">${STATE.balance.toLocaleString()} $INFINITE</div></div>
      <div class="stat-card"><div class="label">Calls Today</div><div class="value">${STATE.usage.today.toLocaleString()}</div><div class="sub">of ${STATE.usage.limit.toLocaleString()} limit</div></div>
      <div class="stat-card"><div class="label">Models Available</div><div class="value green">${STATE.models.length}</div><div class="sub">AI providers active</div></div>
      <div class="stat-card"><div class="label">Your Cost</div><div class="value accent">$0</div><div class="sub">funded by treasury</div></div>
    </div>
    <div class="section">
      <div class="section-title">Daily Usage</div>
      <div class="usage-bar-container">
        <div class="usage-header">
          <div class="usage-count">${STATE.usage.today.toLocaleString()} <span>/ ${STATE.usage.limit.toLocaleString()} calls</span></div>
          <div class="usage-count">${Math.round(usagePct)}%</div>
        </div>
        <div class="usage-bar-track"><div class="usage-bar-fill ${barClass}" style="width: ${usagePct}%"></div></div>
        <div class="usage-legend">
          <div class="usage-legend-item"><div class="usage-legend-dot" style="background: var(--accent)"></div>Used</div>
          <div class="usage-legend-item"><div class="usage-legend-dot" style="background: var(--border)"></div>Remaining</div>
          <div class="usage-legend-item" style="margin-left: auto">Resets at 00:00 UTC</div>
        </div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Quick Access</div>
      <div class="tools-grid">
        <div class="tool-card" onclick="setTab('chat')"><div class="tool-header"><span class="tool-status${hasAnyChatProvider() ? '' : ' coming'}">${hasAnyChatProvider() ? 'LIVE' : 'SOON'}</span></div><div class="tool-name">AI Chat</div><div class="tool-desc">${hasAnyChatProvider() ? 'Chat with Claude and Gemini directly. Streaming responses, markdown rendering, code highlighting.' : 'AI chat will activate after token launch. Claude, Gemini, and OpenAI models included.'}</div><div class="tool-launch">${hasAnyChatProvider() ? 'Open' : 'Preview'}</div></div>
        <div class="tool-card" onclick="setTab('images')"><div class="tool-header"><span class="tool-status${STATE.providers.gemini ? '' : ' coming'}">${STATE.providers.gemini ? 'LIVE' : 'SOON'}</span></div><div class="tool-name">Image Lab</div><div class="tool-desc">${STATE.providers.gemini ? 'Generate high-quality images with Gemini. Describe anything and get instant results.' : 'Image generation will activate after token launch. Powered by Gemini.'}</div><div class="tool-launch">${STATE.providers.gemini ? 'Open' : 'Preview'}</div></div>
        <div class="tool-card" onclick="setTab('video')"><div class="tool-header"><span class="tool-status${STATE.providers.gemini ? '' : ' coming'}">${STATE.providers.gemini ? 'LIVE' : 'SOON'}</span></div><div class="tool-name">Video Lab</div><div class="tool-desc">${STATE.providers.gemini ? 'Generate AI videos with Google Veo 2. Text to video, multiple aspect ratios.' + (isVideoTierAllowed() ? '' : ' Operator+ only.') : 'Video generation will activate after token launch. Powered by Google Veo 2.'}</div><div class="tool-launch">${STATE.providers.gemini ? 'Open' : 'Preview'}</div></div>
        <div class="tool-card" onclick="setTab('trading')"><div class="tool-header"><span class="tool-status">LIVE</span></div><div class="tool-name">Trade Bot</div><div class="tool-desc">Autonomous trading bot. Jupiter swaps, DCA, copy trading, TP/SL triggers, and kill switch. Operator+ tier.</div><div class="tool-launch">Open</div></div>
        <div class="tool-card" onclick="setTab('agents')"><div class="tool-header"><span class="tool-status">LIVE</span></div><div class="tool-name">Tools Hub</div><div class="tool-desc">Pre-configured AI tools, trading bots, and coding assistants. Auto-plugs your API key.</div><div class="tool-launch">Open</div></div>
        <div class="tool-card" onclick="setTab('keys')"><div class="tool-header"><span class="tool-status">LIVE</span></div><div class="tool-name">Raw API</div><div class="tool-desc">Your API key works with standard SDKs. Drop it into any project, agent, or script.</div><div class="tool-launch">View Key</div></div>
      </div>
    </div>
  `;
}
