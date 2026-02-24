// ═══════════════════════════════════════════
// INFINITE Dashboard - Tab: Trading Bot
// ═══════════════════════════════════════════

import { STATE, TRADING } from '../state.js';
import { api, API_BASE, escapeHtml } from '../api.js';
import { renderMarkdown } from '../markdown.js';
import { bindCodeCopyButtons, bindCodeToggleButtons } from '../tools.js';
import { showToast, setTab, copyText, stopBotPolling } from '../actions.js';
import { render } from '../render.js';
import {
  renderBotPortfolio, renderBotOverview, renderBotSwap,
  renderBotDCA, renderBotCopy, renderBotTriggers,
  renderBotHistory,
} from './trading-panels.js';
import './trading-actions.js';
import { isHolder, renderHolderGate } from '../gate.js';

// ─── Conversation Management ───

export function getActiveTradingConversation() {
  if (!TRADING.activeId) {
    const conv = { id: 'tconv_' + Date.now(), messages: [] };
    TRADING.conversations.push(conv);
    TRADING.activeId = conv.id;
  }
  return TRADING.conversations.find(c => c.id === TRADING.activeId);
}

// ─── Trading State Fetching ───

export async function initTradingWallet() {
  try {
    const res = await api('/v1/trading/wallet/create', { method: 'POST' });
    TRADING.wallet = { publicKey: res.publicKey, solBalance: 0 };
    await fetchTradingState();
    render();
  } catch (err) {
    console.error('Wallet creation failed:', err.message);
  }
}

export async function fetchTradingState() {
  if (STATE.activeTab !== 'trading') return;
  if (TRADING._endpointsDead) return;

  try {
    const walletInfo = await api('/v1/trading/wallet/info');
    TRADING.wallet = { publicKey: walletInfo.publicKey, solBalance: walletInfo.solBalance };
    TRADING.positions = walletInfo.positions || [];
    TRADING._fetchFailCount = 0;
  } catch (err) {
    TRADING._fetchFailCount = (TRADING._fetchFailCount || 0) + 1;
    if (err.status === 404) { TRADING.wallet = null; return; }
    if (err.status === 403 || err.status === 502 || err.status === 500 || err.status === 0) {
      TRADING._endpointsDead = true; stopBotPolling(); return;
    }
    if (TRADING._fetchFailCount >= 2) { TRADING._endpointsDead = true; stopBotPolling(); return; }
    return;
  }

  try {
    const results = await Promise.allSettled([
      api('/v1/trading/portfolio'),
      api('/v1/trading/dca/orders'),
      api('/v1/trading/copy/targets'),
      api('/v1/trading/trigger/list'),
      api('/v1/trading/safety/status'),
      api('/v1/trading/history?limit=50'),
    ]);
    if (results[0].status === 'fulfilled') TRADING.portfolio = results[0].value || null;
    if (results[1].status === 'fulfilled') TRADING.dcaOrders = results[1].value || [];
    if (results[2].status === 'fulfilled') TRADING.copyTargets = results[2].value?.targets || [];
    if (results[3].status === 'fulfilled') TRADING.triggers = results[3].value || [];
    if (results[4].status === 'fulfilled') TRADING.safety = results[4].value || null;
    if (results[5].status === 'fulfilled') TRADING.history = results[5].value || [];
  } catch {}
}

// ─── Polling Control ───

export function startBotPolling() {
  if (TRADING.pollInterval || TRADING._endpointsDead) return;
  TRADING._fetchFailCount = 0;
  fetchTradingState().then(() => {
    if (TRADING.pollInterval || TRADING._endpointsDead) return;
    TRADING.pollInterval = setInterval(async () => {
      await fetchTradingState();
      if (STATE.activeTab === 'trading') renderBotPanelContent();
    }, 15000);
  });
}

export function setBotPanel(panel) {
  TRADING.activePanel = panel;
  renderBotPanelContent();
}

// ─── Panel Rendering ───

export function renderBotPanelContent() {
  const main = document.getElementById('botMainPanel');
  if (!main) return;
  switch (TRADING.activePanel) {
    case 'portfolio': main.innerHTML = renderBotPortfolio(); break;
    case 'overview': main.innerHTML = renderBotOverview(); break;
    case 'swap': main.innerHTML = renderBotSwap(); break;
    case 'dca': main.innerHTML = renderBotDCA(); break;
    case 'copy': main.innerHTML = renderBotCopy(); break;
    case 'triggers': main.innerHTML = renderBotTriggers(); break;
    case 'history': main.innerHTML = renderBotHistory(); break;
  }
  document.querySelectorAll('.bot-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.panel === TRADING.activePanel);
  });
}

export function renderTrading() {
  if (!isHolder()) {
    return `
      <div class="page-header">
        <h1 class="page-title">Trade Bot</h1>
        <p class="page-sub">Autonomous trading with Jupiter swaps, DCA, copy trading, and more</p>
      </div>
      ${renderHolderGate('Trade Bot')}
    `;
  }

  const isTradingTier = STATE.tier === 'Operator' || STATE.tier === 'Architect' || STATE.tier === 'Alpha';

  if (!isTradingTier) {
    return `<div class="bot-empty"><div class="bot-empty-icon">/</div><div>Trade Bot requires <strong>Operator</strong> tier or above.</div><div style="margin-top:8px;font-size:10px;color:var(--text-muted);">Hold 100K+ $INFINITE tokens to unlock.</div></div>`;
  }

  setTimeout(() => startBotPolling(), 50);

  const w = TRADING.wallet;
  const safety = TRADING.safety;
  const pnl = safety?.dailyPnlSol || 0;
  const pnlClass = pnl >= 0 ? 'positive' : 'negative';
  const pnlStr = (pnl >= 0 ? '+' : '') + pnl.toFixed(4);
  const isKilled = safety?.isKilled || safety?.isCooldown;
  const dcaActive = TRADING.dcaOrders.filter(d => d.status === 'active').length;
  const copyActive = TRADING.copyTargets.filter(t => !t.isPaused).length;
  const trigActive = TRADING.triggers.filter(t => t.status === 'active').length;

  return `
    <div class="bot-layout">
      <div class="bot-sidebar">
        ${w ? `
          <div class="bot-card">
            <div class="bot-card-title">Wallet</div>
            <div class="bot-wallet-addr" onclick="copyText('${w.publicKey}')" title="Click to copy address" style="cursor:pointer;">
              ${w.publicKey.slice(0, 6)}...${w.publicKey.slice(-4)}
              <span style="color:var(--accent);font-size:9px;margin-left:4px;">COPY</span>
            </div>
            <div class="bot-wallet-bal">${(w.solBalance || 0).toFixed(4)} SOL</div>
            <div class="bot-wallet-bal-label">Available Balance</div>
            <div class="bot-wallet-actions">
              <button class="bot-wallet-action-btn" onclick="copyText('${w.publicKey}')">Copy Address</button>
              <button class="bot-wallet-action-btn" onclick="exportBotPrivateKey()">Export Key</button>
            </div>
          </div>
        ` : `
          <div class="bot-card">
            <div class="bot-card-title">Wallet</div>
            <div style="text-align:center;padding:12px 0;">
              <button class="bot-form-submit" onclick="initTradingWallet()" style="font-size:10px;padding:10px 16px;">Create Burner Wallet</button>
            </div>
          </div>
        `}

        ${w ? `
          <div class="bot-card">
            <div class="bot-card-title">Quick Trade</div>
            <div class="bot-quick-trade">
              <input class="bot-input" id="botQtToken" placeholder="Token address">
              <input class="bot-input" id="botQtAmount" placeholder="SOL amount" type="number" step="0.01">
              <div class="bot-trade-btns">
                <button class="bot-btn-buy" onclick="executeQuickTrade('buy')">BUY</button>
                <button class="bot-btn-sell" onclick="executeQuickTrade('sell')">SELL</button>
              </div>
            </div>
          </div>
        ` : ''}

        <div class="bot-card">
          <div class="bot-card-title">Panels</div>
          <div class="bot-nav-list">
            <div class="bot-nav-item ${TRADING.activePanel === 'portfolio' ? 'active' : ''}" data-panel="portfolio" onclick="setBotPanel('portfolio')">Portfolio</div>
            <div class="bot-nav-item ${TRADING.activePanel === 'overview' ? 'active' : ''}" data-panel="overview" onclick="setBotPanel('overview')">Positions</div>
            <div class="bot-nav-item ${TRADING.activePanel === 'swap' ? 'active' : ''}" data-panel="swap" onclick="setBotPanel('swap')">Swap</div>
            <div class="bot-nav-item ${TRADING.activePanel === 'dca' ? 'active' : ''}" data-panel="dca" onclick="setBotPanel('dca')">DCA <span class="bot-nav-count">${dcaActive}</span></div>
            <div class="bot-nav-item ${TRADING.activePanel === 'copy' ? 'active' : ''}" data-panel="copy" onclick="setBotPanel('copy')">Copy Trade <span class="bot-nav-count">${copyActive}</span></div>
            <div class="bot-nav-item ${TRADING.activePanel === 'triggers' ? 'active' : ''}" data-panel="triggers" onclick="setBotPanel('triggers')">Triggers <span class="bot-nav-count">${trigActive}</span></div>
            <div class="bot-nav-item ${TRADING.activePanel === 'history' ? 'active' : ''}" data-panel="history" onclick="setBotPanel('history')">History</div>
          </div>
        </div>

        <div class="bot-card">
          <div class="bot-card-title">Safety <span class="badge ${isKilled ? 'badge-stopped' : 'badge-live'}">${isKilled ? 'STOPPED' : 'ACTIVE'}</span></div>
          <div class="bot-pnl ${pnlClass}">PnL: ${pnlStr} SOL</div>
          <div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);margin-bottom:10px;">Trades today: ${safety?.dailyTrades || 0}</div>
          ${isKilled
            ? `<button class="bot-resume-btn" onclick="botResume()">RESUME TRADING</button>`
            : `<button class="bot-kill-btn" onclick="botKill()">KILL SWITCH</button>`
          }
        </div>
      </div>
      <div class="bot-main" id="botMainPanel">
        ${renderBotPortfolio()}
      </div>
    </div>
  `;
}

// ─── Session Persistence ───

export function saveTradingHistory() {
  try {
    const toSave = TRADING.conversations.slice(-10).map(c => ({
      id: c.id,
      messages: c.messages.slice(-50),
    }));
    localStorage.setItem('infinite_trading', JSON.stringify({ conversations: toSave, activeId: TRADING.activeId }));
  } catch {}
}

export function loadTradingHistory() {
  try {
    const raw = localStorage.getItem('infinite_trading');
    if (!raw) return;
    const data = JSON.parse(raw);
    TRADING.conversations = data.conversations || [];
    TRADING.activeId = data.activeId;
  } catch {}
}

// ─── Trading Chat ───

export async function sendTradingMessage(tokenAddress) {
  const input = document.getElementById('tradingInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text || TRADING.isGenerating) return;

  input.value = '';
  input.style.height = 'auto';

  const conv = getActiveTradingConversation();
  conv.messages.push({ role: 'user', content: text });

  appendTradingMessageToDOM({ role: 'user', content: text });
  showTradingTypingIndicator();
  TRADING.isGenerating = true;
  updateTradingSendButton();

  const model = TRADING.selectedModel || STATE.models[0] || 'claude-sonnet-4-6';

  try {
    TRADING.abortController = new AbortController();

    const systemPrompt = `You are an expert Solana trading analyst. Provide concise, data-driven analysis. When given a token address, analyze its trading metrics, liquidity, holder distribution, and risk factors. Format responses with clear sections. Use markdown tables for comparisons. Always include a risk assessment (Low/Medium/High/Critical).${tokenAddress ? ` The user is asking about token: ${tokenAddress}` : ''}`;

    const body = {
      model,
      messages: [
        { role: 'user', content: systemPrompt },
        { role: 'assistant', content: 'Understood. I\'ll provide concise, data-driven Solana trading analysis.' },
        ...conv.messages.map(m => ({ role: m.role, content: m.content })),
      ],
    };

    const response = await fetch(`${API_BASE}/v1/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${STATE.apiKeyFull}`,
      },
      body: JSON.stringify(body),
      signal: TRADING.abortController.signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
      throw new Error(err.message || 'Request failed');
    }

    removeTradingTypingIndicator();

    const msgEl = appendTradingMessageToDOM({ role: 'assistant', content: '' });
    const contentEl = msgEl.querySelector('.chat-msg-content');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        try {
          const data = JSON.parse(jsonStr);
          if (data.type === 'text') {
            fullText += data.content;
            contentEl.innerHTML = renderMarkdown(fullText);
            scrollTradingChat();
          } else if (data.type === 'error') {
            throw new Error(data.message);
          }
        } catch (e) {
          if (e.message && !e.message.includes('JSON')) throw e;
        }
      }
    }

    conv.messages.push({ role: 'assistant', content: fullText });
    saveTradingHistory();
    bindCodeCopyButtons();
    bindCodeToggleButtons();

  } catch (err) {
    removeTradingTypingIndicator();
    if (err.name !== 'AbortError') {
      appendTradingMessageToDOM({ role: 'assistant', content: `Error: ${err.message}`, isError: true });
    }
  } finally {
    TRADING.isGenerating = false;
    TRADING.abortController = null;
    updateTradingSendButton();
  }
}

export function appendTradingMessageToDOM(msg) {
  const container = document.getElementById('tradingMessages');
  if (!container) return null;

  const empty = container.querySelector('.chat-empty');
  if (empty) empty.remove();

  const el = document.createElement('div');
  el.className = `chat-message ${msg.role}`;
  el.innerHTML = `
    <div class="chat-msg-avatar">${msg.role === 'user' ? 'You' : 'AI'}</div>
    <div class="chat-msg-body">
      <div class="chat-msg-name">${msg.role === 'user' ? 'You' : 'AI'}</div>
      <div class="chat-msg-content${msg.isError ? ' error' : ''}">${
        msg.role === 'user' ? escapeHtml(msg.content) : (msg.content ? renderMarkdown(msg.content) : '')
      }</div>
    </div>
  `;
  container.appendChild(el);
  scrollTradingChat();
  return el;
}

export function showTradingTypingIndicator() {
  const container = document.getElementById('tradingMessages');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'chat-message assistant';
  el.id = 'tradingTypingIndicator';
  el.innerHTML = `
    <div class="chat-msg-avatar">AI</div>
    <div class="chat-msg-body">
      <div class="chat-typing">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    </div>
  `;
  container.appendChild(el);
  scrollTradingChat();
}

export function removeTradingTypingIndicator() {
  document.getElementById('tradingTypingIndicator')?.remove();
}

export function scrollTradingChat() {
  const el = document.getElementById('tradingMessages');
  if (el) el.scrollTop = el.scrollHeight;
}

export function updateTradingSendButton() {
  const btn = document.getElementById('tradingSendBtn');
  if (btn) {
    btn.disabled = TRADING.isGenerating;
    btn.textContent = TRADING.isGenerating ? '...' : '\u2192';
  }
}

// ─── Window Assignments ───

window.initTradingWallet = initTradingWallet;
window.setBotPanel = setBotPanel;
window.sendTradingMessage = sendTradingMessage;
