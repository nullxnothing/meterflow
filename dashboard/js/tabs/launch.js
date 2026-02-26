// ═══════════════════════════════════════════
// INFINITE Dashboard - Tab: Launch Funded Agent
// ═══════════════════════════════════════════

import { STATE } from '../state.js';
import { api, escapeHtml } from '../api.js';
import { isHolder, renderHolderGate } from '../gate.js';

// ─── Local State ───

let launchState = createFreshState();

function createFreshState() {
  return {
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
    tweetConfig: { personality: 'community', frequency: 'medium', systemPrompt: '' },
    tradeConfig: { strategy: 'moderate', maxPositionSol: 1, systemPrompt: '' },
    chatConfig: { platform: 'discord', personality: 'community', respondTo: 'mentions', systemPrompt: '' },
    connections: {
      twitter: { apiKey: '', apiSecret: '', accessToken: '', accessTokenSecret: '' },
      discord: { botToken: '', guildId: '', channelIds: '' },
      telegram: { botToken: '', chatIds: '' },
      tradeWallet: { mode: 'paper', privateKey: '' },
    },
    devBuySol: 0,
    expandedCredentials: { twitter: false, discord: false, telegram: false, tradeWallet: false },
  };
}

// ─── Constants ───

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

// ─── System Prompt Templates ───

const TWEET_PROMPTS = {
  alpha: 'You are an aggressive alpha caller for ${name} ($${symbol}). You spot opportunities early, share bold takes, and build hype. Be confident, use trading lingo, and keep tweets punchy. Never financial advice.',
  community: 'You are the community voice of ${name} ($${symbol}). You welcome new holders, share project updates, create engagement threads, and keep the vibe positive. Be warm, inclusive, and genuine.',
  news: 'You are a news bot for ${name} ($${symbol}). You report on market moves, on-chain activity, holder growth, and project milestones. Be factual, data-driven, and neutral.',
  meme: 'You are a meme account for ${name} ($${symbol}). You create funny, relatable crypto content. Use humor, trending formats, and self-aware irony. Never boring, always entertaining.',
  analyst: 'You are a TA bot for ${name} ($${symbol}). You analyze charts, identify patterns, share support/resistance levels, and provide technical outlooks. Use proper TA terminology.',
};

const TRADE_PROMPTS = {
  conservative: 'You are a conservative trader for ${name}. Only enter high-conviction positions with strong fundamentals. Take small positions, use tight stop losses, and prioritize capital preservation.',
  moderate: 'You are a balanced trader for ${name}. Mix fundamental analysis with momentum plays. Take moderate positions, scale in/out, and maintain a diversified portfolio.',
  aggressive: 'You are an aggressive degen trader for ${name}. Hunt for 10x plays on new launches, ape into momentum, and accept higher risk for higher reward. Fast in, fast out.',
};

const CHAT_PROMPTS = {
  alpha: 'You are the alpha-focused assistant for ${name} ($${symbol}). Share insights, answer questions about opportunities, and keep the energy high. Be direct and confident.',
  community: 'You are the official AI assistant for ${name} ($${symbol}). Answer questions about the project, help with technical issues, and engage casually. Be helpful but concise.',
  news: 'You are the information bot for ${name} ($${symbol}). Provide factual answers, share relevant news, and report on project metrics. Stay neutral and data-driven.',
  meme: 'You are the fun bot for ${name} ($${symbol}). Keep chat entertaining, respond with humor, and make the community laugh. Stay on brand and never boring.',
  analyst: 'You are the technical assistant for ${name} ($${symbol}). Answer questions about charts, on-chain data, and market structure. Use proper terminology and stay analytical.',
};

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
  const { capabilities } = launchState;

  return `
    <div class="launch-form" id="launchForm">
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">Select at least one capability for your agent. Each module runs autonomously, funded by creator fees.</p>
      <p style="font-size:11px;color:var(--text-muted);margin-bottom:20px;opacity:0.7;">Credentials are optional — your agent will still be created, but capabilities requiring credentials won't execute until connected.</p>

      ${renderTweetCapability(capabilities.tweet)}
      ${renderTradeCapability(capabilities.trade)}
      ${renderChatCapability(capabilities.chat)}

      <div style="display:flex;justify-content:space-between;margin-top:20px;">
        <button class="launch-btn" style="width:auto;padding:14px 48px;background:var(--surface);color:var(--text);border:1px solid var(--border);" onclick="launchPrevStep()">Back</button>
        <button class="launch-btn" style="width:auto;padding:14px 48px;" onclick="launchNextStep()">Next</button>
      </div>
    </div>
  `;
}

// ─── Tweet Capability ───

function renderTweetCapability(isEnabled) {
  const { tweetConfig, connections } = launchState;
  const isExpanded = launchState.expandedCredentials.twitter;

  const configHtml = `
    <div class="launch-form-group" style="margin-top:12px;margin-bottom:12px;">
      <label class="launch-label">System Prompt</label>
      <textarea
        class="launch-input launch-textarea"
        id="launchTweetSystemPrompt"
        placeholder="Describe how your agent should tweet. E.g., 'You are an alpha caller for $TOKEN. Tweet market analysis, hype upcoming catalysts, and engage with community members. Keep it edgy but informative. Never use generic crypto slang.'"
        rows="4"
        style="resize:vertical;min-height:80px;"
      >${escapeHtml(tweetConfig.systemPrompt)}</textarea>
    </div>

    <div class="launch-form-row">
      <div class="launch-form-group" style="margin-bottom:0;">
        <label class="launch-label">Personality Preset</label>
        ${renderSelect('launchTweetPersonality', PERSONALITIES, tweetConfig.personality)}
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Selecting a preset auto-fills the system prompt if empty</div>
      </div>
      <div class="launch-form-group" style="margin-bottom:0;">
        <label class="launch-label">Frequency</label>
        ${renderSelect('launchTweetFrequency', FREQUENCIES, tweetConfig.frequency)}
      </div>
    </div>

    ${renderCollapsibleSection('twitter', 'Connect Twitter', isExpanded, `
      <div class="launch-form-group" style="margin-bottom:8px;">
        <label class="launch-label">API Key</label>
        ${renderPasswordInput('launchTwitterApiKey', connections.twitter.apiKey, 'Twitter API Key')}
      </div>
      <div class="launch-form-group" style="margin-bottom:8px;">
        <label class="launch-label">API Secret</label>
        ${renderPasswordInput('launchTwitterApiSecret', connections.twitter.apiSecret, 'Twitter API Secret')}
      </div>
      <div class="launch-form-group" style="margin-bottom:8px;">
        <label class="launch-label">Access Token</label>
        ${renderPasswordInput('launchTwitterAccessToken', connections.twitter.accessToken, 'Access Token')}
      </div>
      <div class="launch-form-group" style="margin-bottom:4px;">
        <label class="launch-label">Access Token Secret</label>
        ${renderPasswordInput('launchTwitterAccessSecret', connections.twitter.accessTokenSecret, 'Access Token Secret')}
      </div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:8px;">Get these from developer.x.com &rarr; Your App &rarr; Keys and Tokens</div>
    `)}
  `;

  return renderCapabilityCard('tweet', 'Tweet', 'Your agent posts on X, engages with community', isEnabled, configHtml);
}

// ─── Trade Capability ───

function renderTradeCapability(isEnabled) {
  const { tradeConfig, connections } = launchState;
  const isExpanded = launchState.expandedCredentials.tradeWallet;
  const isPaper = connections.tradeWallet.mode === 'paper';

  const configHtml = `
    <div class="launch-form-group" style="margin-top:12px;margin-bottom:12px;">
      <label class="launch-label">System Prompt</label>
      <textarea
        class="launch-input launch-textarea"
        id="launchTradeSystemPrompt"
        placeholder="Describe your agent's trading approach. E.g., 'Focus on new pump.fun launches with >$10k liquidity. Buy early, take 2x profits, never hold bags. Avoid tokens with frozen mint authority.'"
        rows="4"
        style="resize:vertical;min-height:80px;"
      >${escapeHtml(tradeConfig.systemPrompt)}</textarea>
    </div>

    <div class="launch-form-row">
      <div class="launch-form-group" style="margin-bottom:0;">
        <label class="launch-label">Strategy Preset</label>
        ${renderSelect('launchTradeStrategy', STRATEGIES, tradeConfig.strategy)}
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Selecting a preset auto-fills the system prompt if empty</div>
      </div>
      <div class="launch-form-group" style="margin-bottom:0;">
        <label class="launch-label">Max Position (SOL)</label>
        <input class="launch-input" id="launchTradeMaxPos" type="number" step="0.1" min="0.1" max="10" value="${tradeConfig.maxPositionSol}" onchange="updateTradeMaxPos(this.value)">
      </div>
    </div>

    ${renderCollapsibleSection('tradeWallet', 'Agent Wallet', isExpanded, `
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px;">Your agent needs a wallet to execute trades. You can use paper trading mode or provide a private key for live trades.</div>
      <div style="display:flex;gap:16px;margin-bottom:12px;">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--text);">
          <input type="radio" name="tradeWalletMode" value="paper" ${isPaper ? 'checked' : ''} onchange="updateTradeWalletMode('paper')">
          Paper Trading (no real trades)
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--text);">
          <input type="radio" name="tradeWalletMode" value="live" ${!isPaper ? 'checked' : ''} onchange="updateTradeWalletMode('live')">
          Live Trading
        </label>
      </div>
      ${!isPaper ? `
        <div class="launch-form-group" style="margin-bottom:4px;">
          <label class="launch-label">Private Key</label>
          ${renderPasswordInput('launchTradePrivateKey', connections.tradeWallet.privateKey, 'Base58 private key')}
        </div>
        <div style="font-size:10px;color:#e6a23c;margin-top:8px;">Your private key is stored encrypted. Only fund this wallet with what you can afford to lose.</div>
      ` : ''}
    `)}
  `;

  return renderCapabilityCard('trade', 'Trade', 'Your agent monitors and executes trades on Solana', isEnabled, configHtml);
}

// ─── Chat Capability ───

function renderChatCapability(isEnabled) {
  const { chatConfig, connections } = launchState;
  const platform = chatConfig.platform;
  const showDiscord = platform === 'discord' || platform === 'both';
  const showTelegram = platform === 'telegram' || platform === 'both';

  const configHtml = `
    <div class="launch-form-group" style="margin-top:12px;margin-bottom:12px;">
      <label class="launch-label">System Prompt</label>
      <textarea
        class="launch-input launch-textarea"
        id="launchChatSystemPrompt"
        placeholder="Describe how your agent should respond in chat. E.g., 'You are the official AI assistant for this project. Answer questions about the token, help with technical issues, and engage casually. Be helpful but concise.'"
        rows="4"
        style="resize:vertical;min-height:80px;"
      >${escapeHtml(chatConfig.systemPrompt)}</textarea>
    </div>

    <div class="launch-form-row">
      <div class="launch-form-group" style="margin-bottom:0;">
        <label class="launch-label">Personality Preset</label>
        ${renderSelect('launchChatPersonality', PERSONALITIES, chatConfig.personality)}
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Selecting a preset auto-fills the system prompt if empty</div>
      </div>
      <div class="launch-form-group" style="margin-bottom:0;">
        <label class="launch-label">Platform</label>
        ${renderSelect('launchChatPlatform', [
          { value: 'discord', label: 'Discord' },
          { value: 'telegram', label: 'Telegram' },
          { value: 'both', label: 'Both' },
        ], chatConfig.platform)}
      </div>
    </div>

    <div class="launch-form-group" style="margin-top:12px;margin-bottom:12px;">
      <label class="launch-label">Respond To</label>
      ${renderSelect('launchChatRespondTo', [
        { value: 'mentions', label: 'Mentions only' },
        { value: 'all', label: 'All messages' },
      ], chatConfig.respondTo)}
    </div>

    ${showDiscord ? renderCollapsibleSection('discord', 'Connect Discord', launchState.expandedCredentials.discord, `
      <div class="launch-form-group" style="margin-bottom:8px;">
        <label class="launch-label">Bot Token</label>
        ${renderPasswordInput('launchDiscordBotToken', connections.discord.botToken, 'Discord bot token')}
      </div>
      <div class="launch-form-group" style="margin-bottom:8px;">
        <label class="launch-label">Server ID</label>
        <input class="launch-input" id="launchDiscordGuildId" placeholder="Discord server (guild) ID" autocomplete="off" value="${escapeHtml(connections.discord.guildId)}">
      </div>
      <div class="launch-form-group" style="margin-bottom:4px;">
        <label class="launch-label">Channel IDs</label>
        <input class="launch-input" id="launchDiscordChannelIds" placeholder="Comma-separated channel IDs" autocomplete="off" value="${escapeHtml(connections.discord.channelIds)}">
      </div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:8px;">Create a bot at discord.com/developers &rarr; New Application &rarr; Bot &rarr; Token</div>
    `) : ''}

    ${showTelegram ? renderCollapsibleSection('telegram', 'Connect Telegram', launchState.expandedCredentials.telegram, `
      <div class="launch-form-group" style="margin-bottom:8px;">
        <label class="launch-label">Bot Token</label>
        ${renderPasswordInput('launchTelegramBotToken', connections.telegram.botToken, 'Telegram bot token')}
      </div>
      <div class="launch-form-group" style="margin-bottom:4px;">
        <label class="launch-label">Chat IDs</label>
        <input class="launch-input" id="launchTelegramChatIds" placeholder="Comma-separated chat IDs" autocomplete="off" value="${escapeHtml(connections.telegram.chatIds)}">
      </div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:8px;">Create a bot via @BotFather on Telegram</div>
    `) : ''}
  `;

  return renderCapabilityCard('chat', 'Chat', 'Your agent responds in Discord or Telegram', isEnabled, configHtml);
}

// ─── Shared UI Components ───

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

function renderPasswordInput(id, value, placeholder) {
  return `
    <div style="position:relative;">
      <input
        class="launch-input"
        id="${id}"
        type="password"
        placeholder="${placeholder}"
        autocomplete="off"
        value="${escapeHtml(value)}"
        style="padding-right:36px;"
      >
      <button
        type="button"
        onclick="togglePasswordVisibility('${id}')"
        style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:10px;font-family:var(--font-mono);padding:2px 4px;"
      >SHOW</button>
    </div>
  `;
}

function renderCollapsibleSection(key, title, isExpanded, innerHtml) {
  const chevron = isExpanded ? '&#9660;' : '&#9654;';

  return `
    <div style="margin-top:16px;border:1px solid var(--border);background:var(--bg);">
      <div
        onclick="toggleCredentialSection('${key}')"
        style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;user-select:none;"
      >
        <span style="font-size:12px;font-weight:600;color:var(--text);">${title}</span>
        <span style="font-size:10px;color:var(--text-muted);">${chevron}</span>
      </div>
      ${isExpanded ? `<div style="padding:0 14px 14px 14px;border-top:1px solid var(--border);">${innerHtml}</div>` : ''}
    </div>
  `;
}

// ─── Step 3: Review ───

function renderStepReview() {
  const { capabilities, tweetConfig, tradeConfig, chatConfig, connections } = launchState;
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
          ${enabledCaps.map(cap => renderReviewCapability(cap, { tweetConfig, tradeConfig, chatConfig, connections, personalityLabel, frequencyLabel, strategyLabel })).join('')}
        </div>
      </div>

      ${renderConnectionStatusSection(enabledCaps, connections)}

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

      <div style="font-size:11px;color:var(--text-muted);margin-top:12px;padding:10px 14px;background:var(--bg);border:1px solid var(--border);">
        You can test your agent after launching in the My Agents tab.
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

function renderReviewCapability(cap, ctx) {
  let details = '';
  if (cap === 'tweet') {
    details = `${ctx.personalityLabel(ctx.tweetConfig.personality)} &middot; ${ctx.frequencyLabel(ctx.tweetConfig.frequency)}`;
  } else if (cap === 'trade') {
    details = `${ctx.strategyLabel(ctx.tradeConfig.strategy)} &middot; Max ${ctx.tradeConfig.maxPositionSol} SOL`;
  } else if (cap === 'chat') {
    const platform = ctx.chatConfig.platform === 'both' ? 'Discord + Telegram' : ctx.chatConfig.platform.charAt(0).toUpperCase() + ctx.chatConfig.platform.slice(1);
    const respond = ctx.chatConfig.respondTo === 'mentions' ? 'Mentions only' : 'All messages';
    details = `${platform} &middot; ${ctx.personalityLabel(ctx.chatConfig.personality)} &middot; ${respond}`;
  }

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
      <div>
        <span style="font-size:13px;font-weight:600;text-transform:capitalize;">${cap}</span>
      </div>
      <div style="font-size:11px;color:var(--text-muted);">${details}</div>
    </div>
  `;
}

function renderConnectionStatusSection(enabledCaps, connections) {
  const items = [];

  if (enabledCaps.includes('tweet')) {
    const hasTwitterCreds = connections.twitter.apiKey && connections.twitter.apiSecret
      && connections.twitter.accessToken && connections.twitter.accessTokenSecret;
    items.push(renderStatusBadge('Twitter', hasTwitterCreds, 'Connected', 'No credentials — will skip posting'));
  }

  if (enabledCaps.includes('trade')) {
    const isPaper = connections.tradeWallet.mode === 'paper';
    if (isPaper) {
      items.push(renderStatusBadge('Trade', null, '', 'Paper Trading', '#e6a23c'));
    } else {
      const hasKey = !!connections.tradeWallet.privateKey;
      items.push(renderStatusBadge('Trade', hasKey, 'Live — wallet connected', 'No private key provided'));
    }
  }

  if (enabledCaps.includes('chat')) {
    const platform = launchState.chatConfig.platform;
    if (platform === 'discord' || platform === 'both') {
      const hasDiscord = !!connections.discord.botToken;
      items.push(renderStatusBadge('Chat (Discord)', hasDiscord, 'Bot token provided', 'Not configured'));
    }
    if (platform === 'telegram' || platform === 'both') {
      const hasTelegram = !!connections.telegram.botToken;
      items.push(renderStatusBadge('Chat (Telegram)', hasTelegram, 'Bot token provided', 'Not configured'));
    }
  }

  if (items.length === 0) return '';

  return `
    <div style="border:1px solid var(--border);background:var(--bg);margin-bottom:20px;padding:16px 20px;">
      <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;">Connection Status</div>
      ${items.join('')}
    </div>
  `;
}

function renderStatusBadge(label, isConnected, connectedText, disconnectedText, overrideColor) {
  if (overrideColor) {
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;">
        <span style="font-size:12px;color:var(--text);">${label}</span>
        <span style="font-size:11px;color:${overrideColor};font-weight:600;">${disconnectedText}</span>
      </div>
    `;
  }

  const color = isConnected ? '#67c23a' : 'var(--text-muted)';
  const text = isConnected ? connectedText : disconnectedText;

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;">
      <span style="font-size:12px;color:var(--text);">${label}</span>
      <span style="font-size:11px;color:${color};font-weight:${isConnected ? '600' : '400'};">${text}</span>
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
  saveCurrentStepInputs();
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
    saveCurrentStepInputs();
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
  saveCurrentStepInputs();
  launchState.imageData = null;
  launchState.imageFileName = '';
  rerenderLaunchForm();
};

// ─── Password Toggle ───

window.togglePasswordVisibility = function (inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  const btn = input.parentElement?.querySelector('button');
  if (btn) btn.textContent = isHidden ? 'HIDE' : 'SHOW';
};

// ─── Collapsible Sections ───

window.toggleCredentialSection = function (key) {
  saveCurrentStepInputs();
  launchState.expandedCredentials[key] = !launchState.expandedCredentials[key];
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
  // Selects that trigger auto-fill need to save inputs first, then rerender to show the filled prompt
  const needsRerender = new Set(['launchTweetPersonality', 'launchTradeStrategy', 'launchChatPersonality', 'launchChatPlatform']);

  if (needsRerender.has(id)) saveCurrentStepInputs();

  const mapping = {
    launchTweetPersonality: () => {
      launchState.tweetConfig.personality = value;
      maybeAutoFillPrompt('tweet', value);
    },
    launchTweetFrequency: () => { launchState.tweetConfig.frequency = value; },
    launchTradeStrategy: () => {
      launchState.tradeConfig.strategy = value;
      maybeAutoFillPrompt('trade', value);
    },
    launchChatPlatform: () => { launchState.chatConfig.platform = value; },
    launchChatPersonality: () => {
      launchState.chatConfig.personality = value;
      maybeAutoFillPrompt('chat', value);
    },
    launchChatRespondTo: () => { launchState.chatConfig.respondTo = value; },
  };

  if (mapping[id]) {
    mapping[id]();
    // Only rerender when DOM structure changes (preset fills prompt, platform toggles sections)
    if (needsRerender.has(id)) rerenderLaunchForm();
  }
};

window.updateTradeMaxPos = function (value) {
  const num = parseFloat(value);
  if (!isNaN(num) && num >= 0.1 && num <= 10) {
    launchState.tradeConfig.maxPositionSol = num;
  }
};

window.updateTradeWalletMode = function (mode) {
  saveCurrentStepInputs();
  launchState.connections.tradeWallet.mode = mode;
  if (mode === 'paper') launchState.connections.tradeWallet.privateKey = '';
  rerenderLaunchForm();
};

// ─── Preset Auto-fill Logic ───

function maybeAutoFillPrompt(capability, presetValue) {
  const templates = { tweet: TWEET_PROMPTS, trade: TRADE_PROMPTS, chat: CHAT_PROMPTS };
  const configKey = { tweet: 'tweetConfig', trade: 'tradeConfig', chat: 'chatConfig' };

  const template = templates[capability]?.[presetValue];
  if (!template) return;

  const config = launchState[configKey[capability]];
  if (config.systemPrompt.trim()) return;

  const name = launchState.name || 'MyAgent';
  const symbol = launchState.symbol || 'TOKEN';
  config.systemPrompt = template.replace(/\$\{name\}/g, name).replace(/\$\{symbol\}/g, symbol);
}

// ─── Navigation ───

function saveCurrentStepInputs() {
  if (launchState.step === 1) {
    saveStepOneInputs();
  }
  if (launchState.step === 2) {
    saveStepTwoInputs();
  }
  if (launchState.step === 3) {
    launchState.devBuySol = parseFloat(document.getElementById('launchDevBuy')?.value) || 0;
  }
}

function saveStepOneInputs() {
  const el = (id) => document.getElementById(id);
  // Use nullish check — if element exists, take its value (even if empty)
  if (el('launchName')) launchState.name = el('launchName').value.trim();
  if (el('launchSymbol')) launchState.symbol = el('launchSymbol').value.trim().toUpperCase();
  if (el('launchDesc')) launchState.description = el('launchDesc').value.trim();
  if (el('launchTwitter')) launchState.twitter = el('launchTwitter').value.trim();
  if (el('launchWebsite')) launchState.website = el('launchWebsite').value.trim();
}

function saveStepTwoInputs() {
  // Trade max position
  const maxPos = document.getElementById('launchTradeMaxPos')?.value;
  if (maxPos) launchState.tradeConfig.maxPositionSol = parseFloat(maxPos) || launchState.tradeConfig.maxPositionSol;

  // System prompts
  saveTextareaValue('launchTweetSystemPrompt', launchState.tweetConfig, 'systemPrompt');
  saveTextareaValue('launchTradeSystemPrompt', launchState.tradeConfig, 'systemPrompt');
  saveTextareaValue('launchChatSystemPrompt', launchState.chatConfig, 'systemPrompt');

  // Twitter credentials
  saveInputValue('launchTwitterApiKey', launchState.connections.twitter, 'apiKey');
  saveInputValue('launchTwitterApiSecret', launchState.connections.twitter, 'apiSecret');
  saveInputValue('launchTwitterAccessToken', launchState.connections.twitter, 'accessToken');
  saveInputValue('launchTwitterAccessSecret', launchState.connections.twitter, 'accessTokenSecret');

  // Discord credentials
  saveInputValue('launchDiscordBotToken', launchState.connections.discord, 'botToken');
  saveInputValue('launchDiscordGuildId', launchState.connections.discord, 'guildId');
  saveInputValue('launchDiscordChannelIds', launchState.connections.discord, 'channelIds');

  // Telegram credentials
  saveInputValue('launchTelegramBotToken', launchState.connections.telegram, 'botToken');
  saveInputValue('launchTelegramChatIds', launchState.connections.telegram, 'chatIds');

  // Trade wallet
  saveInputValue('launchTradePrivateKey', launchState.connections.tradeWallet, 'privateKey');
}

function saveInputValue(elementId, target, key) {
  const el = document.getElementById(elementId);
  if (el) target[key] = el.value.trim();
}

function saveTextareaValue(elementId, target, key) {
  const el = document.getElementById(elementId);
  if (el) target[key] = el.value;
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
        connections: launchState.connections,
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
  launchState = createFreshState();
  rerenderLaunchForm();
};

window.navigateToAgents = function () {
  const tabBtn = document.querySelector('[data-tab="my-agents"]') || document.querySelector('[data-tab="agents"]');
  if (tabBtn) tabBtn.click();
};

// ─── Rerender ───

/** Targeted rerender — only update the form card, not the entire page */
function rerenderLaunchForm() {
  if (STATE.activeTab !== 'launch') return;

  const formCard = document.querySelector('.launch-form-card');
  if (formCard) {
    // Only rebuild the form card contents (step indicator + error + step content)
    formCard.innerHTML = `
      ${renderStepIndicator()}
      ${launchState.error ? `<div class="launch-error">${escapeHtml(launchState.error)}</div>` : ''}
      ${renderCurrentStep()}
    `;
    return;
  }

  // Fallback: full page rerender if form card not found
  const main = document.querySelector('.main');
  if (main) {
    main.innerHTML = renderLaunch();
  }
}
