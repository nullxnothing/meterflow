// ═══════════════════════════════════════════
// Launch Agent — Actions & Event Handlers
// ═══════════════════════════════════════════

import { STATE } from '../state.js';
import { api } from '../api.js';
import { escapeHtml } from '../utils.js';
import { launchState, resetLaunchState, TWEET_PROMPTS, TRADE_PROMPTS, CHAT_PROMPTS } from './launch-state.js';
import { renderLaunch, renderStepIndicator, renderCurrentStep } from './launch-views.js';

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

// ─── Input Persistence ───

function saveCurrentStepInputs() {
  if (launchState.step === 1) saveStepOneInputs();
  if (launchState.step === 2) saveStepTwoInputs();
  if (launchState.step === 3) {
    launchState.devBuySol = parseFloat(document.getElementById('launchDevBuy')?.value) || 0;
  }
}

function saveStepOneInputs() {
  const el = (id) => document.getElementById(id);
  if (el('launchName')) launchState.name = el('launchName').value.trim();
  if (el('launchSymbol')) launchState.symbol = el('launchSymbol').value.trim().toUpperCase();
  if (el('launchDesc')) launchState.description = el('launchDesc').value.trim();
  if (el('launchTwitter')) launchState.twitter = el('launchTwitter').value.trim();
  if (el('launchWebsite')) launchState.website = el('launchWebsite').value.trim();
}

function saveStepTwoInputs() {
  const maxPos = document.getElementById('launchTradeMaxPos')?.value;
  if (maxPos) launchState.tradeConfig.maxPositionSol = parseFloat(maxPos) || launchState.tradeConfig.maxPositionSol;

  saveTextareaValue('launchTweetSystemPrompt', launchState.tweetConfig, 'systemPrompt');
  saveTextareaValue('launchTradeSystemPrompt', launchState.tradeConfig, 'systemPrompt');
  saveTextareaValue('launchChatSystemPrompt', launchState.chatConfig, 'systemPrompt');

  saveInputValue('launchTwitterApiKey', launchState.connections.twitter, 'apiKey');
  saveInputValue('launchTwitterApiSecret', launchState.connections.twitter, 'apiSecret');
  saveInputValue('launchTwitterAccessToken', launchState.connections.twitter, 'accessToken');
  saveInputValue('launchTwitterAccessSecret', launchState.connections.twitter, 'accessTokenSecret');

  saveInputValue('launchDiscordBotToken', launchState.connections.discord, 'botToken');
  saveInputValue('launchDiscordGuildId', launchState.connections.discord, 'guildId');
  saveInputValue('launchDiscordChannelIds', launchState.connections.discord, 'channelIds');

  saveInputValue('launchTelegramBotToken', launchState.connections.telegram, 'botToken');
  saveInputValue('launchTelegramChatIds', launchState.connections.telegram, 'chatIds');

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

// ─── Validation ───

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

// ─── Step Navigation ───

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
  resetLaunchState();
  rerenderLaunchForm();
};

window.navigateToAgents = function () {
  const tabBtn = document.querySelector('[data-tab="my-agents"]') || document.querySelector('[data-tab="agents"]');
  if (tabBtn) tabBtn.click();
};

// ─── Targeted Rerender ───

function rerenderLaunchForm() {
  if (STATE.activeTab !== 'launch') return;

  const formCard = document.querySelector('.launch-form-card');
  if (formCard) {
    formCard.innerHTML = `
      ${renderStepIndicator()}
      ${launchState.error ? `<div class="launch-error">${escapeHtml(launchState.error)}</div>` : ''}
      ${renderCurrentStep()}
    `;
    return;
  }

  const main = document.querySelector('.main');
  if (main) {
    main.innerHTML = renderLaunch();
  }
}
