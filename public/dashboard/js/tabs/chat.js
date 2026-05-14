// ═══════════════════════════════════════════
// Meterflow Dashboard - Tab: AI Chat
// ═══════════════════════════════════════════

import { STATE, CHAT } from '../state.js';
import { escapeHtml, scrollChat } from '../utils.js';
import { getActiveConversation, newConversation } from '../session.js';
import { renderMarkdown } from '../markdown.js';
import { renderToolResultCardHtml, bindCodeCopyButtons, bindCodeToggleButtons } from '../tools.js';
import { isHolder, isTrial, canAccessChat, renderHolderGate, renderTrialBanner, renderTrialExhausted } from '../gate.js?v=preview-link-2';

export function renderChat() {
  if (!canAccessChat()) {
    return `
      <div class="page-header">
        <h1 class="page-title">AI Chat</h1>
        <p class="page-sub">Chat with Claude, Gemini, and GPT. Streaming responses, tools, and code execution.</p>
      </div>
      ${isTrial() && STATE.usage.remaining <= 0 ? renderTrialExhausted() : renderHolderGate('AI Chat')}
    `;
  }

  const conv = getActiveConversation();
  const messages = conv ? conv.messages : [];

  // Set default model — trial users get limited models
  const trialMode = isTrial();
  const availableModels = trialMode ? ['gpt-4o-mini'] : (STATE.models || []);
  if (trialMode) CHAT.selectedModel = 'gpt-4o-mini';
  else if (!CHAT.selectedModel && STATE.models.length) CHAT.selectedModel = STATE.models[0];

  setTimeout(() => {
    scrollChat();
    bindCodeCopyButtons();
    bindCodeToggleButtons();
    document.getElementById('chatInput')?.focus();
  }, 50);

  const sidebarClass = CHAT.sidebarOpen ? '' : ' sidebar-collapsed';

  return `
    ${renderTrialBanner()}
    <div class="chat-with-sidebar${sidebarClass}">
      <div class="chat-container">
        <div class="chat-header">
          <div class="chat-header-left">
            <select class="chat-model-select" id="chatModelSelect">
              ${availableModels.map(m =>
                `<option value="${m}" ${m === CHAT.selectedModel ? 'selected' : ''}>${m}</option>`
              ).join('')}
            </select>
          </div>
          <div class="u-inline-actions">
            ${CHAT.conversations.length > 1 ? `
              <select class="chat-model-select u-max-compact" id="chatConvSelect">
                ${CHAT.conversations.map(c =>
                  `<option value="${c.id}" ${c.id === CHAT.activeId ? 'selected' : ''}>${escapeHtml(c.title)}</option>`
                ).join('')}
              </select>
            ` : ''}
            <button class="btn-sm primary" onclick="newConversation()">+ New</button>
            <button class="btn-sm sidebar-toggle" id="sidebarToggle" title="Toggle sidebar">${CHAT.sidebarOpen ? '\u2759\u2759' : '\u2630'}</button>
          </div>
        </div>

        <div class="chat-messages" id="chatMessages">
          ${messages.length === 0 ? `
            <div class="chat-empty">
              <div class="chat-empty-icon">/</div>
              <div class="chat-empty-title">Start a conversation</div>
              <div class="chat-empty-sub">Chat with Claude and Gemini through the Meterflow gateway.</div>
            </div>
          ` : messages.map(m => `
            <div class="chat-message ${m.role}">
              <div class="chat-msg-avatar">${m.role === 'user' ? 'You' : 'AI'}</div>
              <div class="chat-msg-body">
                <div class="chat-msg-name">${m.role === 'user' ? 'You' : (m.model || 'AI')}</div>
                ${m.images ? `<div class="chat-msg-images">${m.images.filter(img => ['image/png','image/jpeg','image/gif','image/webp'].includes(img.mimeType)).map(img => `<img src="data:${escapeHtml(img.mimeType)};base64,${img.data}" alt="uploaded">`).join('')}</div>` : ''}
                <div class="chat-msg-content">${m.role === 'user' ? escapeHtml(m.content) : renderMarkdown(m.content)}</div>
                ${m.sources ? `<div class="search-sources">${m.sources.slice(0,6).map(s => `<a class="search-source-chip" href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title || s.url)}</a>`).join('')}</div>` : ''}
                ${m.toolResults ? m.toolResults.map(tr => renderToolResultCardHtml(tr.tool, tr.data)).join('') : ''}
              </div>
            </div>
          `).join('')}
        </div>

        ${CHAT.pendingImages.length > 0 ? `
          <div class="chat-image-preview" id="chatImagePreview">
            ${CHAT.pendingImages.filter(img => ['image/png','image/jpeg','image/gif','image/webp'].includes(img.mimeType)).map((img, i) => `
              <div class="chat-image-thumb">
                <img src="data:${escapeHtml(img.mimeType)};base64,${img.data}" alt="upload">
                <button class="remove-img" onclick="removePendingImage(${i})">x</button>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="chat-input-area">
          <button class="chat-upload-btn" id="chatUploadBtn" title="Upload image">+</button>
          <input type="file" id="chatFileInput" accept="image/*" multiple hidden>
          <button class="chat-upload-btn chat-connectors-btn" id="chatConnectorsBtn" title="Connections">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2v4M10 10v4M4 6h4a2 2 0 012 2v0M8 8h4"/><circle cx="6" cy="2" r="1"/><circle cx="10" cy="14" r="1"/></svg>
            ${Object.values(STATE.connections).some(Boolean) ? '<span class="connectors-dot"></span>' : ''}
          </button>
          <textarea class="chat-input" id="chatInput" placeholder="Message Meterflow..." rows="1"></textarea>
          <button class="chat-send-btn" id="chatSendBtn" ${CHAT.isGenerating ? 'disabled' : ''}>${CHAT.isGenerating ? '...' : '\u2192'}</button>
        </div>
      </div>

      <div class="chat-qa-sidebar">
        <div class="bot-card">
          <div class="bot-card-title">Quick Actions</div>
          <div class="trading-quick-btns">
            <button class="trading-quick-btn" onclick="sendQuickPrompt('What is Meterflow? Explain the Solana agent payment and API metering model.')">About Meterflow</button>
            <button class="trading-quick-btn" onclick="sendQuickPrompt('Help me write clean, efficient code. Ask me what language and what I need.')">Code Help</button>
            <button class="trading-quick-btn" onclick="sendQuickPrompt('I need help researching a topic. Ask me what to research and provide a thorough analysis.')">Research</button>
            <button class="trading-quick-btn" onclick="sendQuickPrompt('Help me brainstorm ideas. Ask me what the topic or problem is.')">Brainstorm</button>
          </div>
        </div>
        <div class="bot-card">
          <div class="bot-card-title">Token Lookup</div>
          <div class="trading-token-input">
            <input type="text" id="chatTokenAddr" placeholder="Token address...">
            <button class="btn-sm primary" onclick="lookupToken()">Go</button>
          </div>
          <div id="tokenInfoCard"></div>
        </div>
      </div>
    </div>
  `;
}
