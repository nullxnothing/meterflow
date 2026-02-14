// ═══════════════════════════════════════════
// INFINITE Dashboard - Tab: AI Chat
// ═══════════════════════════════════════════

import { STATE, CHAT } from '../state.js';
import { escapeHtml } from '../api.js';
import { getActiveConversation, newConversation } from '../session.js';
import { renderMarkdown } from '../markdown.js';
import { renderToolResultCardHtml, bindCodeCopyButtons } from '../tools.js';
import { scrollChat } from '../chat.js';

export function renderChat() {
  const conv = getActiveConversation();
  const messages = conv ? conv.messages : [];

  // Set default model if needed
  if (!CHAT.selectedModel && STATE.models.length) CHAT.selectedModel = STATE.models[0];

  setTimeout(() => {
    scrollChat();
    bindCodeCopyButtons();
    document.getElementById('chatInput')?.focus();
  }, 50);

  return `
    <div class="chat-with-sidebar">
      <div class="chat-container">
        <div class="chat-header">
          <div class="chat-header-left">
            <select class="chat-model-select" id="chatModelSelect">
              ${(STATE.models || []).map(m =>
                `<option value="${m}" ${m === CHAT.selectedModel ? 'selected' : ''}>${m}</option>`
              ).join('')}
            </select>
          </div>
          <div style="display:flex;gap:8px;">
            ${CHAT.conversations.length > 1 ? `
              <select class="chat-model-select" id="chatConvSelect" style="max-width:200px;">
                ${CHAT.conversations.map(c =>
                  `<option value="${c.id}" ${c.id === CHAT.activeId ? 'selected' : ''}>${escapeHtml(c.title)}</option>`
                ).join('')}
              </select>
            ` : ''}
            <button class="btn-sm primary" onclick="newConversation()">+ New</button>
          </div>
        </div>

        <div class="chat-messages" id="chatMessages">
          ${messages.length === 0 ? `
            <div class="chat-empty">
              <div class="chat-empty-icon">/</div>
              <div class="chat-empty-title">Start a conversation</div>
              <div class="chat-empty-sub">Chat with Claude and Gemini. Free, no billing, powered by $INFINITE treasury.</div>
            </div>
          ` : messages.map(m => `
            <div class="chat-message ${m.role}">
              <div class="chat-msg-avatar">${m.role === 'user' ? 'You' : 'AI'}</div>
              <div class="chat-msg-body">
                <div class="chat-msg-name">${m.role === 'user' ? 'You' : (m.model || 'AI')}</div>
                ${m.images ? `<div class="chat-msg-images">${m.images.map(img => `<img src="data:${img.mimeType};base64,${img.data}" alt="uploaded">`).join('')}</div>` : ''}
                <div class="chat-msg-content">${m.role === 'user' ? escapeHtml(m.content) : renderMarkdown(m.content)}</div>
                ${m.sources ? `<div class="search-sources">${m.sources.slice(0,6).map(s => `<a class="search-source-chip" href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title || s.url)}</a>`).join('')}</div>` : ''}
                ${m.toolResults ? m.toolResults.map(tr => renderToolResultCardHtml(tr.tool, tr.data)).join('') : ''}
              </div>
            </div>
          `).join('')}
        </div>

        ${CHAT.pendingImages.length > 0 ? `
          <div class="chat-image-preview" id="chatImagePreview">
            ${CHAT.pendingImages.map((img, i) => `
              <div class="chat-image-thumb">
                <img src="data:${img.mimeType};base64,${img.data}" alt="upload">
                <button class="remove-img" onclick="removePendingImage(${i})">x</button>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="chat-input-area">
          <button class="chat-upload-btn" id="chatUploadBtn" title="Upload image">+</button>
          <input type="file" id="chatFileInput" accept="image/*" multiple style="display:none;">
          <button class="chat-upload-btn chat-connectors-btn" id="chatConnectorsBtn" title="Connections">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2v4M10 10v4M4 6h4a2 2 0 012 2v0M8 8h4"/><circle cx="6" cy="2" r="1"/><circle cx="10" cy="14" r="1"/></svg>
            ${Object.values(STATE.connections).some(Boolean) ? '<span class="connectors-dot"></span>' : ''}
          </button>
          <textarea class="chat-input" id="chatInput" placeholder="Message INFINITE..." rows="1"></textarea>
          <button class="chat-send-btn" id="chatSendBtn" ${CHAT.isGenerating ? 'disabled' : ''}>${CHAT.isGenerating ? '...' : '\u2192'}</button>
        </div>
      </div>

      <div class="chat-qa-sidebar">
        <div class="bot-card">
          <div class="bot-card-title">Quick Actions</div>
          <div class="trading-quick-btns">
            <button class="trading-quick-btn" onclick="sendTradingQuery('What are the top trending Solana tokens right now? Analyze volume, social buzz, and on-chain activity.')">Trending</button>
            <button class="trading-quick-btn" onclick="sendTradingQuery('Give me a broad Solana market overview. SOL price action, DEX volumes, new token launches, and overall sentiment.')">Market</button>
            <button class="trading-quick-btn" onclick="sendTradingQuery('What are the biggest risk factors to watch for in the current Solana ecosystem? Any major red flags?')">Risk Check</button>
            <button class="trading-quick-btn" onclick="sendTradingQuery('Find me high-potential alpha opportunities on Solana right now. New protocols, undervalued tokens, or emerging narratives.')">Find Alpha</button>
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
