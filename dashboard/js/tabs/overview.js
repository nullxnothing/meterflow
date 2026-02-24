// ═══════════════════════════════════════════
// INFINITE Dashboard - Tab: Overview
// ═══════════════════════════════════════════

import { STATE } from '../state.js';
import { escapeHtml } from '../api.js';
import { isHolder } from '../gate.js';

function getResetCountdown() {
  const now = new Date();
  const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const diff = utcMidnight - now;
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

function hasAnyChatProvider() {
  return STATE.providers.claude || STATE.providers.gemini || STATE.providers.openai;
}

function isVideoTierAllowed() {
  const t = (STATE.tier || '').toLowerCase();
  return t === 'operator' || t === 'architect';
}

export function renderOverview() {
  const hasKey = isHolder();

  if (!hasKey) {
    return renderPublicOverview();
  }

  const isLoaded = STATE.usage.limit > 0 || STATE.tier;
  const usagePct = STATE.usage.limit > 0 ? (STATE.usage.today / STATE.usage.limit) * 100 : 0;
  const barClass = usagePct > 90 ? 'danger' : usagePct > 70 ? 'warning' : '';
  const resetTime = getResetCountdown();
  return `
    <div class="page-header">
      <h1 class="page-title">Welcome back</h1>
      <p class="page-sub">${STATE.tier || '\u2014'} tier \u2014 ${STATE.usage.remaining.toLocaleString()} API calls remaining today</p>
    </div>
    <div class="stats-row">
      ${isLoaded ? `
        <div class="stat-card"><div class="label">Your Tier</div><div class="value accent">${STATE.tier || '\u2014'}</div><div class="sub">${(STATE.balance ?? 0).toLocaleString()} $INFINITE</div></div>
        <div class="stat-card"><div class="label">Calls Today</div><div class="value">${STATE.usage.today.toLocaleString()}</div><div class="sub">of ${STATE.usage.limit.toLocaleString()} limit</div></div>
        <div class="stat-card"><div class="label">Models Available</div><div class="value green">${STATE.models.length}</div><div class="sub">AI providers active</div></div>
        <div class="stat-card"><div class="label">Your Cost</div><div class="value accent">$0</div><div class="sub">funded by treasury</div></div>
      ` : `
        <div class="stat-card skeleton"><div class="label">Your Tier</div><div class="skeleton-value"></div><div class="sub" style="visibility:hidden">.</div></div>
        <div class="stat-card skeleton"><div class="label">Calls Today</div><div class="skeleton-value"></div><div class="sub" style="visibility:hidden">.</div></div>
        <div class="stat-card skeleton"><div class="label">Models Available</div><div class="skeleton-value"></div><div class="sub" style="visibility:hidden">.</div></div>
        <div class="stat-card skeleton"><div class="label">Your Cost</div><div class="skeleton-value"></div><div class="sub" style="visibility:hidden">.</div></div>
      `}
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
          <div class="usage-legend-item" style="margin-left: auto">Resets in ${resetTime}</div>
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
    <div class="compliance-notice">
      <div class="compliance-notice-header"><span class="compliance-dot"></span> Provider Compliance</div>
      <div class="compliance-notice-text">
        INFINITE operates in full compliance with the terms of service of all integrated AI providers, including Anthropic, Google, and OpenAI.
        All API access is properly authorized and licensed. Rate limits, usage policies, and content guidelines from each provider are enforced at the proxy layer.
      </div>
    </div>
  `;
}

function renderPublicOverview() {
  return `
    <div class="page-header">
      <h1 class="page-title">INFINITE Protocol</h1>
      <p class="page-sub">Token-gated AI API access. Hold $INFINITE to unlock Claude, Gemini, GPT, and more.</p>
    </div>
    <div class="stats-row">
      <div class="stat-card"><div class="label">Signal Tier</div><div class="value accent">10K</div><div class="sub">$INF \u2014 1,000 calls/day</div></div>
      <div class="stat-card"><div class="label">Operator Tier</div><div class="value accent">100K</div><div class="sub">$INF \u2014 10,000 calls/day</div></div>
      <div class="stat-card"><div class="label">Architect Tier</div><div class="value accent">1M</div><div class="sub">$INF \u2014 Unlimited</div></div>
      <div class="stat-card"><div class="label">Your Cost</div><div class="value accent">$0</div><div class="sub">funded by treasury</div></div>
    </div>
    ${!STATE.connected ? `
      <div class="section" style="text-align:center;padding:32px 0;">
        <button class="btn-primary" style="padding:14px 40px;font-size:15px;" onclick="openWalletConnect()">Connect Wallet to Get Started</button>
        <p style="color:var(--text-muted);font-size:12px;margin-top:12px;">3 free AI chat calls included — no tokens required</p>
      </div>
    ` : `
      <div class="section" style="text-align:center;padding:24px 0;">
        <p style="color:var(--text-muted);font-size:13px;">Your wallet holds <strong>${(STATE.balance ?? 0).toLocaleString()} $INFINITE</strong>. Minimum 10,000 required for API access.</p>
      </div>
    `}
    <div class="section">
      <div class="section-title">What You Get</div>
      <div class="tools-grid">
        <div class="tool-card" onclick="setTab('chat')"><div class="tool-header"><span class="tool-status">LIVE</span></div><div class="tool-name">AI Chat</div><div class="tool-desc">Chat with Claude, Gemini, and GPT. Streaming responses, tool use, code execution, and web search.</div><div class="tool-launch">Preview</div></div>
        <div class="tool-card" onclick="setTab('images')"><div class="tool-header"><span class="tool-status">LIVE</span></div><div class="tool-name">Image Lab</div><div class="tool-desc">Generate high-quality images with Gemini. Photorealistic, illustration, concept art.</div><div class="tool-launch">Preview</div></div>
        <div class="tool-card" onclick="setTab('video')"><div class="tool-header"><span class="tool-status">LIVE</span></div><div class="tool-name">Video Lab</div><div class="tool-desc">Generate AI videos with Google Veo 2. Text to video, multiple aspect ratios.</div><div class="tool-launch">Preview</div></div>
        <div class="tool-card" onclick="setTab('trading')"><div class="tool-header"><span class="tool-status">LIVE</span></div><div class="tool-name">Trade Bot</div><div class="tool-desc">Autonomous trading bot. Jupiter swaps, DCA, copy trading, TP/SL triggers. Operator+ tier.</div><div class="tool-launch">Preview</div></div>
        <div class="tool-card" onclick="setTab('models')"><div class="tool-header"><span class="tool-status">LIVE</span></div><div class="tool-name">7+ Models</div><div class="tool-desc">Claude Opus, Sonnet, Gemini Pro, Flash, GPT-4o. All via one API key.</div><div class="tool-launch">View</div></div>
        <div class="tool-card" onclick="setTab('keys')"><div class="tool-header"><span class="tool-status">LIVE</span></div><div class="tool-name">Raw API</div><div class="tool-desc">Drop-in replacement for Anthropic & Google SDKs. Works with any HTTP client.</div><div class="tool-launch">Preview</div></div>
      </div>
    </div>
    <div class="compliance-notice">
      <div class="compliance-notice-header"><span class="compliance-dot"></span> Provider Compliance</div>
      <div class="compliance-notice-text">
        INFINITE operates in full compliance with the terms of service of all integrated AI providers, including Anthropic, Google, and OpenAI.
        All API access is properly authorized and licensed. Rate limits, usage policies, and content guidelines from each provider are enforced at the proxy layer.
      </div>
    </div>
  `;
}
