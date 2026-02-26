// ═══════════════════════════════════════════
// INFINITE Dashboard - Tab: Launch Funded Agent
// ═══════════════════════════════════════════

import { STATE } from '../state.js';
import { api, escapeHtml } from '../api.js';
import { isHolder, renderHolderGate } from '../gate.js';

// ─── Local State ───

let launchState = {
  step: 1,
  loading: false,
  result: null,
  error: null,
  name: '',
  symbol: '',
  description: '',
  imageData: null,
  imageFileName: '',
  twitter: '',
  website: '',
  capabilities: { tweet: false, trade: false, chat: false },
  tweetConfig: { personality: 'community', frequency: 'medium' },
  tradeConfig: { strategy: 'moderate', maxPositionSol: 1 },
  chatConfig: { platform: 'discord', personality: 'community', respondTo: 'mentions' },
  devBuySol: 0,
};

const PERSONALITIES = [
  { value: 'alpha', label: 'Alpha Caller' },
  { value: 'community', label: 'Community Builder' },
  { value: 'news', label: 'News Reporter' },
  { value: 'meme', label: 'Meme Lord' },
  { value: 'analyst', label: 'Technical Analyst' },
];

const FREQUENCIES = [
  { value: 'high', label: 'High (6-10/day)' },
  { value: 'medium', label: 'Medium (3-5/day)' },
  { value: 'low', label: 'Low (1-2/day)' },
];

const STRATEGIES = [
  { value: 'conservative', label: 'Conservative' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'aggressive', label: 'Aggressive' },
];

// ─── Main Render ───

export function renderLaunch() {
  if (!isHolder()) {
    return `
      <div class="page-header">
        <h1 class="page-title">Launch Agent</h1>
        <p class="page-sub">Launch funded AI agents with their own token. Creator fees power autonomous operations.</p>
      </div>
      ${renderHolderGate('Agent Launcher')}
    `;
  }

  return `
    <div class="page-header">
      <h1 class="page-title">Launch Agent</h1>
      <p class="page-sub">Launch an AI agent backed by its own token. 30% of creator fees fund autonomous operations — tweet, trade, and chat from block one.</p>
    </div>

    ${renderHeroSection()}
    ${renderVsSection()}

    <div class="tools-section">
      <div class="section-title">Create Your Agent</div>
      <div class="launch-form-card">
        ${renderStepIndicator()}
        ${launchState.error ? `<div class="launch-error">${escapeHtml(launchState.error)}</div>` : ''}
        ${renderCurrentStep()}
      </div>
    </div>
  `;
}

// ─── Hero Section ───

function renderHeroSection() {
  return `
    <div class="launch-hero">
      <div class="launch-hero-card">
        <div class="launch-hero-badge">FUNDED AI AGENTS</div>
        <h3>How It Works</h3>
        <div class="launch-flow">
          <div class="launch-flow-step">
            <div class="launch-flow-num">1</div>
            <div class="launch-flow-text">
              <strong>Design your agent</strong>
              <p>Configure capabilities: tweet, trade, chat. Define its personality and strategy.</p>
            </div>
          </div>
          <div class="launch-flow-step">
            <div class="launch-flow-num">2</div>
            <div class="launch-flow-text">
              <strong>Launch with a token</strong>
              <p>Your agent gets its own token on pump.fun. Holders get access to the agent's output.</p>
            </div>
          </div>
          <div class="launch-flow-step">
            <div class="launch-flow-num">3</div>
            <div class="launch-flow-text">
              <strong>Fees fund your agent</strong>
              <p>30% of creator fees power your agent's operations. More volume = more budget.</p>
            </div>
          </div>
          <div class="launch-flow-step">
            <div class="launch-flow-num">4</div>
            <div class="launch-flow-text">
              <strong>Agent runs autonomously</strong>
              <p>AI-powered and self-sustaining. Your agent works 24/7, funded by trading volume.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─── VS Section ───

function renderVsSection() {
  return `
    <div class="launch-vs">
      <div class="launch-vs-card launch-vs-old">
        <div class="launch-vs-label">Dead memecoins</div>
        <div class="launch-vs-item">Token does nothing after launch</div>
        <div class="launch-vs-item">Creator dumps and leaves</div>
        <div class="launch-vs-item">No utility, pure speculation</div>
        <div class="launch-vs-item">Community abandoned</div>
      </div>
      <div class="launch-vs-divider">vs</div>
      <div class="launch-vs-card launch-vs-new">
        <div class="launch-vs-label">Funded agents</div>
        <div class="launch-vs-item">Agent works 24/7 from block one</div>
        <div class="launch-vs-item">Creator fees fund real operations</div>
        <div class="launch-vs-item">Tweet, trade, chat — built-in utility</div>
        <div class="launch-vs-item">Self-sustaining AI agent</div>
      </div>
    </div>
  `;
}

// ─── Step Indicator ───

function renderStepIndicator() {
  if (launchState.step === 4) return '';

  const steps = [
    { num: 1, label: 'Identity' },
    { num: 2, label: 'Capabilities' },
    { num: 3, label: 'Review' },
  ];

  return `
    <div style="display:flex;align-items:center;gap:0;margin-bottom:28px;">
      ${steps.map((s, i) => {
        const isActive = launchState.step === s.num;
        const isComplete = launchState.step > s.num;
        const dotColor = isActive ? 'var(--accent)' : isComplete ? 'var(--accent)' : 'var(--border)';
        const textColor = isActive ? 'var(--text)' : isComplete ? 'var(--accent)' : 'var(--text-muted)';
        const connector = i < steps.length - 1
          ? `<div style="flex:1;height:1px;background:${isComplete ? 'var(--accent)' : 'var(--border)'};margin:0 12px;"></div>`
          : '';
        return `
          <div style="display:flex;align-items:center;gap:8px;${i > 0 && i < steps.length ? '' : ''}">
            <div style="width:24px;height:24px;border-radius:50%;background:${dotColor};color:var(--bg);display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:11px;font-weight:700;">
              ${isComplete ? '&#10003;' : s.num}
            </div>
            <span style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${textColor};white-space:nowrap;">${s.label}</span>
          </div>
          ${connector}
        `;
      }).join('')}
    </div>
  `;
}

// ─── Step Router ───

function renderCurrentStep() {
  switch (launchState.step) {
    case 1: return renderStepIdentity();
    case 2: return renderStepCapabilities();
    case 3: return renderStepReview();
    case 4: return renderStepResult();
    default: return renderStepIdentity();
  }
}

// ─── Step 1: Identity ───

function renderStepIdentity() {
  const hasImage = !!launchState.imageData;

  return `
    <div class="launch-form" id="launchForm">
      <div class="launch-form-row">
        <div class="launch-form-group">
          <label class="launch-label">Token Name *</label>
          <input class="launch-input" id="launchName" placeholder="e.g. AlphaBot" maxlength="32" value="${escapeHtml(launchState.name)}">
        </div>
        <div class="launch-form-group">
          <label class="launch-label">Ticker *</label>
          <input class="launch-input" id="launchSymbol" placeholder="e.g. ABOT" maxlength="10" style="text-transform:uppercase;" value="${escapeHtml(launchState.symbol)}">
        </div>
      </div>

      <div class="launch-form-group">
        <label class="launch-label">Description</label>
        <textarea class="launch-input launch-textarea" id="launchDesc" placeholder="What does this agent do? (auto-generated if empty)" rows="3">${escapeHtml(launchState.description)}</textarea>
      </div>

      <div class="launch-form-group">
        <label class="launch-label">Agent Image</label>
        <div
          id="launchDropZone"
          ondrop="handleLaunchDrop(event)"
          ondragover="handleLaunchDragOver(event)"
          ondragleave="handleLaunchDragLeave(event)"
          onclick="document.getElementById('launchFileInput').click()"
          style="border:2px dashed var(--border);padding:${hasImage ? '16px' : '40px 20px'};text-align:center;cursor:pointer;transition:border-color 0.2s;background:var(--bg);"
        >
          ${hasImage ? `
            <div style="display:flex;align-items:center;gap:16px;justify-content:center;">
              <img src="${launchState.imageData}" style="width:80px;height:80px;object-fit:cover;border:1px solid var(--border);" alt="Preview">
              <div style="text-align:left;">
                <div style="font-size:13px;color:var(--text);margin-bottom:4px;">${escapeHtml(launchState.imageFileName)}</div>
                <button class="btn-sm danger" onclick="event.stopPropagation();removeLaunchImage();" style="font-size:10px;padding:4px 10px;">Remove</button>
              </div>
            </div>
          ` : `
            <div style="font-size:13px;color:var(--text-muted);margin-bottom:6px;">Drag & drop an image here or click to browse</div>
            <div style="font-size:11px;color:var(--text-muted);">PNG, JPG, GIF, or WebP (max 5MB)</div>
          `}
        </div>
        <input type="file" id="launchFileInput" accept="image/png,image/jpeg,image/gif,image/webp" style="display:none;" onchange="handleLaunchFileSelect(event)">
      </div>

      <div class="launch-form-row">
        <div class="launch-form-group">
          <label class="launch-label">Twitter (optional)</label>
          <input class="launch-input" id="launchTwitter" placeholder="https://x.com/..." value="${escapeHtml(launchState.twitter)}">
        </div>
        <div class="launch-form-group">
          <label class="launch-label">Website (optional)</label>
          <input class="launch-input" id="launchWebsite" placeholder="https://..." value="${escapeHtml(launchState.website)}">
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;margin-top:8px;">
        <button class="launch-btn" style="width:auto;padding:14px 48px;" onclick="launchNextStep()">Next</button>
      </div>
    </div>
  `;
}

// ─── Step 2: Capabilities ───

function renderStepCapabilities() {
  const { capabilities, tweetConfig, tradeConfig, chatConfig } = launchState;

  return `
    <div class="launch-form" id="launchForm">
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px;">Select at least one capability for your agent. Each module runs autonomously, funded by creator fees.</p>

      ${renderCapabilityCard('tweet', 'Tweet', 'Your agent posts on X, engages with community', capabilities.tweet, `
        <div class="launch-form-row" style="margin-top:12px;">
          <div class="launch-form-group" style="margin-bottom:0;">
            <label class="launch-label">Personality</label>
            ${renderSelect('launchTweetPersonality', PERSONALITIES, tweetConfig.personality)}
          </div>
          <div class="launch-form-group" style="margin-bottom:0;">
            <label class="launch-label">Frequency</label>
            ${renderSelect('launchTweetFrequency', FREQUENCIES, tweetConfig.frequency)}
          </div>
        </div>
      `)}

      ${renderCapabilityCard('trade', 'Trade', 'Your agent monitors and executes trades on Solana', capabilities.trade, `
        <div class="launch-form-row" style="margin-top:12px;">
          <div class="launch-form-group" style="margin-bottom:0;">
            <label class="launch-label">Strategy</label>
            ${renderSelect('launchTradeStrategy', STRATEGIES, tradeConfig.strategy)}
          </div>
          <div class="launch-form-group" style="margin-bottom:0;">
            <label class="launch-label">Max Position (SOL)</label>
            <input class="launch-input" id="launchTradeMaxPos" type="number" step="0.1" min="0.1" max="10" value="${tradeConfig.maxPositionSol}" onchange="updateTradeMaxPos(this.value)">
          </div>
        </div>
      `)}

      ${renderCapabilityCard('chat', 'Chat', 'Your agent responds in Discord or Telegram', capabilities.chat, `
        <div class="launch-form-row" style="margin-top:12px;">
          <div class="launch-form-group" style="margin-bottom:0;">
            <label class="launch-label">Platform</label>
            ${renderSelect('launchChatPlatform', [
              { value: 'discord', label: 'Discord' },
              { value: 'telegram', label: 'Telegram' },
              { value: 'both', label: 'Both' },
            ], chatConfig.platform)}
          </div>
          <div class="launch-form-group" style="margin-bottom:0;">
            <label class="launch-label">Personality</label>
            ${renderSelect('launchChatPersonality', PERSONALITIES, chatConfig.personality)}
          </div>
        </div>
        <div class="launch-form-group" style="margin-top:12px;margin-bottom:0;">
          <label class="launch-label">Respond To</label>
          ${renderSelect('launchChatRespondTo', [
            { value: 'mentions', label: 'Mentions only' },
            { value: 'all', label: 'All messages' },
          ], chatConfig.respondTo)}
        </div>
      `)}

      <div style="display:flex;justify-content:space-between;margin-top:20px;">
        <button class="launch-btn" style="width:auto;padding:14px 48px;background:var(--surface);color:var(--text);border:1px solid var(--border);" onclick="launchPrevStep()">Back</button>
        <button class="launch-btn" style="width:auto;padding:14px 48px;" onclick="launchNextStep()">Next</button>
      </div>
    </div>
  `;
}

function renderCapabilityCard(key, title, desc, isEnabled, configHtml) {
  const borderColor = isEnabled ? 'var(--accent)' : 'var(--border)';
  const bg = isEnabled ? 'var(--surface)' : 'var(--bg)';
  const toggleBg = isEnabled ? 'var(--accent)' : 'var(--border)';
  const toggleDot = isEnabled ? 'translateX(18px)' : 'translateX(2px)';

  return `
    <div style="border:1px solid ${borderColor};background:${bg};padding:20px;margin-bottom:12px;transition:all 0.2s;">
      <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;" onclick="toggleCapability('${key}')">
        <div>
          <div style="font-size:14px;font-weight:600;margin-bottom:4px;">${title}</div>
          <div style="font-size:12px;color:var(--text-muted);">${desc}</div>
        </div>
        <div style="width:40px;height:22px;border-radius:11px;background:${toggleBg};position:relative;flex-shrink:0;transition:background 0.2s;">
          <div style="width:18px;height:18px;border-radius:50%;background:var(--bg);position:absolute;top:2px;transform:${toggleDot};transition:transform 0.2s;"></div>
        </div>
      </div>
      ${isEnabled ? `<div style="border-top:1px solid var(--border);margin-top:16px;padding-top:12px;">${configHtml}</div>` : ''}
    </div>
  `;
}

function renderSelect(id, options, selected) {
  return `
    <select class="launch-input" id="${id}" onchange="updateLaunchSelect('${id}', this.value)" style="cursor:pointer;">
      ${options.map(o => `<option value="${o.value}" ${o.value === selected ? 'selected' : ''}>${o.label}</option>`).join('')}
    </select>
  `;
}

// ─── Step 3: Review ───

function renderStepReview() {
  const { capabilities, tweetConfig, tradeConfig, chatConfig } = launchState;
  const enabledCaps = Object.entries(capabilities).filter(([, v]) => v).map(([k]) => k);

  const personalityLabel = (val) => PERSONALITIES.find(p => p.value === val)?.label || val;
  const frequencyLabel = (val) => FREQUENCIES.find(f => f.value === val)?.label || val;
  const strategyLabel = (val) => STRATEGIES.find(s => s.value === val)?.label || val;

  return `
    <div class="launch-form" id="launchForm">
      <div style="border:1px solid var(--border);background:var(--bg);margin-bottom:20px;">
        <div style="display:flex;gap:20px;padding:20px;border-bottom:1px solid var(--border);">
          ${launchState.imageData
            ? `<img src="${launchState.imageData}" style="width:72px;height:72px;object-fit:cover;border:1px solid var(--border);flex-shrink:0;" alt="Agent">`
            : `<div style="width:72px;height:72px;background:var(--surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <span style="font-size:28px;color:var(--text-muted);">?</span>
              </div>`
          }
          <div style="flex:1;min-width:0;">
            <div style="font-size:18px;font-weight:700;">${escapeHtml(launchState.name || 'Untitled')}</div>
            <div style="font-family:var(--font-mono);font-size:12px;color:var(--accent);margin-top:2px;">$${escapeHtml(launchState.symbol || '???')}</div>
            ${launchState.description ? `<div style="font-size:12px;color:var(--text-muted);margin-top:6px;line-height:1.5;">${escapeHtml(launchState.description)}</div>` : ''}
          </div>
        </div>

        ${(launchState.twitter || launchState.website) ? `
          <div style="padding:12px 20px;border-bottom:1px solid var(--border);display:flex;gap:20px;">
            ${launchState.twitter ? `<span style="font-size:11px;color:var(--text-muted);">Twitter: <span style="color:var(--text);">${escapeHtml(launchState.twitter)}</span></span>` : ''}
            ${launchState.website ? `<span style="font-size:11px;color:var(--text-muted);">Website: <span style="color:var(--text);">${escapeHtml(launchState.website)}</span></span>` : ''}
          </div>
        ` : ''}

        <div style="padding:16px 20px;">
          <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;">Agent Capabilities</div>
          ${enabledCaps.map(cap => {
            let details = '';
            if (cap === 'tweet') {
              details = `${personalityLabel(tweetConfig.personality)} &middot; ${frequencyLabel(tweetConfig.frequency)}`;
            } else if (cap === 'trade') {
              details = `${strategyLabel(tradeConfig.strategy)} &middot; Max ${tradeConfig.maxPositionSol} SOL`;
            } else if (cap === 'chat') {
              const platform = chatConfig.platform === 'both' ? 'Discord + Telegram' : chatConfig.platform.charAt(0).toUpperCase() + chatConfig.platform.slice(1);
              const respond = chatConfig.respondTo === 'mentions' ? 'Mentions only' : 'All messages';
              details = `${platform} &middot; ${personalityLabel(chatConfig.personality)} &middot; ${respond}`;
            }
            return `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
                <div>
                  <span style="font-size:13px;font-weight:600;text-transform:capitalize;">${cap}</span>
                </div>
                <div style="font-size:11px;color:var(--text-muted);">${details}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div class="launch-fee-notice">
        <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;">Fee Split</div>
        <div style="display:flex;gap:12px;margin-bottom:4px;">
          <div style="flex:7;height:8px;background:var(--accent);border-radius:4px;"></div>
          <div style="flex:3;height:8px;background:var(--text-muted);border-radius:4px;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:6px;">
          <span style="color:var(--accent);">70% &rarr; Infinite Treasury</span>
          <span style="color:var(--text-muted);">30% &rarr; Agent Operations</span>
        </div>
      </div>

      <div class="launch-form-group" style="margin-top:16px;">
        <label class="launch-label">Dev Buy (SOL)</label>
        <input class="launch-input" id="launchDevBuy" type="number" step="0.1" min="0" value="${launchState.devBuySol}" placeholder="0 = no dev buy">
        <div class="launch-hint">Optional initial buy in SOL. Set to 0 for a fair launch.</div>
      </div>

      <div style="display:flex;justify-content:space-between;margin-top:20px;">
        <button class="launch-btn" style="width:auto;padding:14px 48px;background:var(--surface);color:var(--text);border:1px solid var(--border);" onclick="launchPrevStep()">Back</button>
        <button class="launch-btn" style="width:auto;padding:14px 64px;" id="launchBtn" onclick="submitLaunch()" ${launchState.loading ? 'disabled' : ''}>
          ${launchState.loading ? 'Launching...' : 'Launch Agent'}
        </button>
      </div>
    </div>
  `;
}

// ─── Step 4: Result ───

function renderStepResult() {
  const result = launchState.result;
  if (!result) return '';

  const metadataUri = result.metadataUri || '';
  const agentId = result.agentId || result.id || '';
  const name = result.tokenMetadata?.name || launchState.name;
  const symbol = result.tokenMetadata?.symbol || launchState.symbol;

  return `
    <div class="launch-result">
      <div style="width:56px;height:56px;border-radius:50%;background:var(--accent);color:var(--bg);display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 16px;">&#10003;</div>
      <div class="launch-result-badge">AGENT LAUNCHED</div>
      <h3>${escapeHtml(name)} ($${escapeHtml(symbol)})</h3>
      <p style="color:var(--text-muted);font-size:12px;margin-bottom:20px;">Your funded agent is live. Creator fees will power its operations autonomously.</p>

      <div class="launch-result-info">
        ${agentId ? `
          <div class="launch-result-row">
            <span>Agent ID</span>
            <code onclick="copyText('${escapeHtml(agentId)}')" style="cursor:pointer;">${escapeHtml(agentId.length > 24 ? agentId.slice(0, 12) + '...' + agentId.slice(-8) : agentId)} <span style="color:var(--accent);font-size:9px;">COPY</span></code>
          </div>
        ` : ''}
        ${metadataUri ? `
          <div class="launch-result-row">
            <span>Metadata URI</span>
            <code onclick="copyText('${escapeHtml(metadataUri)}')" style="cursor:pointer;">${escapeHtml(metadataUri.slice(0, 36))}... <span style="color:var(--accent);font-size:9px;">COPY</span></code>
          </div>
        ` : ''}
        <div class="launch-result-row">
          <span>Capabilities</span>
          <code>${Object.entries(launchState.capabilities).filter(([, v]) => v).map(([k]) => k).join(', ')}</code>
        </div>
        <div class="launch-result-row">
          <span>Platform</span>
          <code>pump.fun</code>
        </div>
      </div>

      <div class="launch-next-steps">
        <div class="section-title" style="margin-bottom:12px;">Next Steps</div>
        <div class="tool-config-box" style="font-size:12px;line-height:1.8;">
          1. Your agent's token is being created on pump.fun<br>
          2. Once trading begins, creator fees will automatically fund your agent<br>
          3. Monitor your agent's activity in the My Agents tab<br>
          4. The agent will begin operating once sufficient fees accumulate
        </div>
      </div>

      <div style="display:flex;gap:12px;margin-top:20px;">
        <button class="launch-btn" style="flex:1;background:var(--accent);color:var(--bg);" onclick="navigateToAgents()">View My Agents</button>
        <button class="launch-btn" style="flex:1;background:var(--surface);color:var(--text);border:1px solid var(--border);" onclick="resetLaunch()">Launch Another</button>
      </div>
    </div>
  `;
}

// ─── Image Handling ───

function processLaunchImage(file) {
  if (!file.type.match(/^image\/(png|jpe?g|gif|webp)$/)) {
    launchState.error = 'Only PNG, JPG, GIF, or WebP images allowed.';
    rerenderLaunchForm();
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    launchState.error = 'Image must be under 5MB.';
    rerenderLaunchForm();
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    launchState.imageData = e.target.result;
    launchState.imageFileName = file.name;
    launchState.error = null;
    rerenderLaunchForm();
  };
  reader.readAsDataURL(file);
}

window.handleLaunchDrop = function (e) {
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');
  const file = e.dataTransfer?.files[0];
  if (file) processLaunchImage(file);
};

window.handleLaunchDragOver = function (e) {
  e.preventDefault();
  e.currentTarget.style.borderColor = 'var(--accent)';
};

window.handleLaunchDragLeave = function (e) {
  e.currentTarget.style.borderColor = 'var(--border)';
};

window.handleLaunchFileSelect = function (e) {
  const file = e.target?.files[0];
  if (file) processLaunchImage(file);
};

window.removeLaunchImage = function () {
  launchState.imageData = null;
  launchState.imageFileName = '';
  rerenderLaunchForm();
};

// ─── Capability Toggles ───

window.toggleCapability = function (key) {
  saveCurrentStepInputs();
  launchState.capabilities[key] = !launchState.capabilities[key];
  launchState.error = null;
  rerenderLaunchForm();
};

window.updateLaunchSelect = function (id, value) {
  const mapping = {
    launchTweetPersonality: () => { launchState.tweetConfig.personality = value; },
    launchTweetFrequency: () => { launchState.tweetConfig.frequency = value; },
    launchTradeStrategy: () => { launchState.tradeConfig.strategy = value; },
    launchChatPlatform: () => { launchState.chatConfig.platform = value; },
    launchChatPersonality: () => { launchState.chatConfig.personality = value; },
    launchChatRespondTo: () => { launchState.chatConfig.respondTo = value; },
  };
  if (mapping[id]) mapping[id]();
};

window.updateTradeMaxPos = function (value) {
  const num = parseFloat(value);
  if (!isNaN(num) && num >= 0.1 && num <= 10) {
    launchState.tradeConfig.maxPositionSol = num;
  }
};

// ─── Navigation ───

function saveCurrentStepInputs() {
  if (launchState.step === 1) {
    launchState.name = document.getElementById('launchName')?.value.trim() || launchState.name;
    launchState.symbol = document.getElementById('launchSymbol')?.value.trim().toUpperCase() || launchState.symbol;
    launchState.description = document.getElementById('launchDesc')?.value.trim() || launchState.description;
    launchState.twitter = document.getElementById('launchTwitter')?.value.trim() || launchState.twitter;
    launchState.website = document.getElementById('launchWebsite')?.value.trim() || launchState.website;
  }
  if (launchState.step === 2) {
    const maxPos = document.getElementById('launchTradeMaxPos')?.value;
    if (maxPos) launchState.tradeConfig.maxPositionSol = parseFloat(maxPos) || launchState.tradeConfig.maxPositionSol;
  }
  if (launchState.step === 3) {
    launchState.devBuySol = parseFloat(document.getElementById('launchDevBuy')?.value) || 0;
  }
}

function validateStep(step) {
  if (step === 1) {
    if (!launchState.name) return 'Token name is required.';
    if (launchState.name.length > 32) return 'Token name must be 32 characters or fewer.';
    if (!launchState.symbol) return 'Ticker is required.';
    if (launchState.symbol.length > 10) return 'Ticker must be 10 characters or fewer.';
  }
  if (step === 2) {
    const { tweet, trade, chat } = launchState.capabilities;
    if (!tweet && !trade && !chat) return 'Enable at least one capability.';
  }
  return null;
}

window.launchNextStep = function () {
  saveCurrentStepInputs();
  const err = validateStep(launchState.step);
  if (err) {
    launchState.error = err;
    rerenderLaunchForm();
    return;
  }
  launchState.error = null;
  launchState.step = Math.min(launchState.step + 1, 4);
  rerenderLaunchForm();
};

window.launchPrevStep = function () {
  saveCurrentStepInputs();
  launchState.error = null;
  launchState.step = Math.max(launchState.step - 1, 1);
  rerenderLaunchForm();
};

// ─── Submit ───

window.submitLaunch = async function () {
  saveCurrentStepInputs();

  launchState.loading = true;
  launchState.error = null;
  rerenderLaunchForm();

  try {
    const result = await api('/v1/launch/create', {
      method: 'POST',
      body: JSON.stringify({
        name: launchState.name,
        symbol: launchState.symbol,
        description: launchState.description,
        image: launchState.imageData,
        twitter: launchState.twitter,
        website: launchState.website,
        devBuySol: launchState.devBuySol,
        capabilities: launchState.capabilities,
        tweetConfig: launchState.tweetConfig,
        tradeConfig: launchState.tradeConfig,
        chatConfig: launchState.chatConfig,
      }),
    });
    launchState.result = result;
    launchState.loading = false;
    launchState.step = 4;
    rerenderLaunchForm();
  } catch (err) {
    launchState.error = err.message || 'Launch failed. Please try again.';
    launchState.loading = false;
    rerenderLaunchForm();
  }
};

// ─── Reset & Navigate ───

window.resetLaunch = function () {
  launchState = {
    step: 1,
    loading: false,
    result: null,
    error: null,
    name: '',
    symbol: '',
    description: '',
    imageData: null,
    imageFileName: '',
    twitter: '',
    website: '',
    capabilities: { tweet: false, trade: false, chat: false },
    tweetConfig: { personality: 'community', frequency: 'medium' },
    tradeConfig: { strategy: 'moderate', maxPositionSol: 1 },
    chatConfig: { platform: 'discord', personality: 'community', respondTo: 'mentions' },
    devBuySol: 0,
  };
  rerenderLaunchForm();
};

window.navigateToAgents = function () {
  const tabBtn = document.querySelector('[data-tab="my-agents"]') || document.querySelector('[data-tab="agents"]');
  if (tabBtn) tabBtn.click();
};

// ─── Rerender ───

function rerenderLaunchForm() {
  const main = document.querySelector('.main');
  if (main && STATE.activeTab === 'launch') {
    main.innerHTML = renderLaunch();
  }
}
