// ═══════════════════════════════════════════
// INFINITE Dashboard - Chat Logic
// ═══════════════════════════════════════════

import { STATE, CHAT } from './state.js';
import { API_BASE, escapeHtml } from './api.js';
import { getActiveConversation, saveChatHistory } from './session.js';
import { renderMarkdown } from './markdown.js';
import { renderImagePreview } from './images.js';
import { showToolIndicator, removeToolIndicator, showSearchSources, showToolResultCard, bindCodeCopyButtons } from './tools.js';

// ─── Main Chat Function ───

export async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text || CHAT.isGenerating) return;

  input.value = '';
  input.style.height = 'auto';

  const conv = getActiveConversation();
  const sentImages = CHAT.pendingImages.length > 0 ? [...CHAT.pendingImages] : null;
  conv.messages.push({ role: 'user', content: text, images: sentImages });

  // Update title from first message
  if (conv.messages.filter(m => m.role === 'user').length === 1) {
    conv.title = text.slice(0, 50) + (text.length > 50 ? '...' : '');
  }

  appendMessageToDOM({ role: 'user', content: text, images: sentImages });
  showTypingIndicator();
  CHAT.isGenerating = true;
  updateSendButton();

  const model = CHAT.selectedModel || STATE.models[0] || 'claude-sonnet-4-5-20250929';
  const tools = CHAT.enabledTools.length > 0 ? [...CHAT.enabledTools] : undefined;
  const images = sentImages || undefined;

  // Clear pending images after capturing
  CHAT.pendingImages = [];
  renderImagePreview();

  try {
    CHAT.abortController = new AbortController();

    const response = await fetch(`${API_BASE}/v1/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${STATE.apiKeyFull}`,
      },
      body: JSON.stringify({
        model,
        messages: conv.messages.map(m => ({ role: m.role, content: m.content })),
        tools,
        images,
      }),
      signal: CHAT.abortController.signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
      throw new Error(err.message || 'Request failed');
    }

    removeTypingIndicator();

    const msgEl = appendMessageToDOM({ role: 'assistant', content: '', model });
    const contentEl = msgEl.querySelector('.chat-msg-content');
    const bodyEl = msgEl.querySelector('.chat-msg-body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';
    let collectedSources = [];
    let collectedToolResults = [];

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
            scrollChat();
          } else if (data.type === 'tool_start') {
            showToolIndicator(bodyEl, data.tool, data.query);
          } else if (data.type === 'tool_result') {
            removeToolIndicator(bodyEl);
            if (data.tool === 'web_search' && data.sources && data.sources.length > 0) {
              collectedSources = collectedSources.concat(data.sources);
              showSearchSources(bodyEl, collectedSources);
            } else if (data.tool && data.data) {
              collectedToolResults.push({ tool: data.tool, data: data.data });
              showToolResultCard(bodyEl, data.tool, data.data);
            }
          } else if (data.type === 'error') {
            throw new Error(data.message);
          }
        } catch (e) {
          if (e.message && !e.message.includes('JSON')) throw e;
        }
      }
    }

    removeToolIndicator(bodyEl);
    conv.messages.push({
      role: 'assistant', content: fullText, model,
      sources: collectedSources.length > 0 ? collectedSources : undefined,
      toolResults: collectedToolResults.length > 0 ? collectedToolResults : undefined,
    });
    saveChatHistory();
    bindCodeCopyButtons();

  } catch (err) {
    removeTypingIndicator();
    if (err.name !== 'AbortError') {
      appendMessageToDOM({ role: 'assistant', content: `Error: ${err.message}`, isError: true });
    }
  } finally {
    CHAT.isGenerating = false;
    CHAT.abortController = null;
    updateSendButton();
  }
}

// ─── DOM Helpers ───

export function appendMessageToDOM(msg) {
  const container = document.getElementById('chatMessages');
  if (!container) return null;

  // Remove empty state if present
  const empty = container.querySelector('.chat-empty');
  if (empty) empty.remove();

  const imagesHtml = msg.images ? `<div class="chat-msg-images">${msg.images.map(img =>
    `<img src="data:${img.mimeType};base64,${img.data}" alt="uploaded">`
  ).join('')}</div>` : '';

  const el = document.createElement('div');
  el.className = `chat-message ${msg.role}`;
  el.innerHTML = `
    <div class="chat-msg-avatar">${msg.role === 'user' ? 'You' : 'AI'}</div>
    <div class="chat-msg-body">
      <div class="chat-msg-name">${msg.role === 'user' ? 'You' : (msg.model || 'AI')}</div>
      ${imagesHtml}
      <div class="chat-msg-content${msg.isError ? ' error' : ''}">${
        msg.role === 'user' ? escapeHtml(msg.content) : (msg.content ? renderMarkdown(msg.content) : '')
      }</div>
    </div>
  `;
  container.appendChild(el);
  scrollChat();
  return el;
}

export function showTypingIndicator() {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'chat-message assistant';
  el.id = 'typingIndicator';
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
  scrollChat();
}

export function removeTypingIndicator() {
  document.getElementById('typingIndicator')?.remove();
}

export function scrollChat() {
  const el = document.getElementById('chatMessages');
  if (el) el.scrollTop = el.scrollHeight;
}

export function updateSendButton() {
  const btn = document.getElementById('chatSendBtn');
  if (btn) {
    btn.disabled = CHAT.isGenerating;
    btn.textContent = CHAT.isGenerating ? '...' : '\u2192';
  }
}

// Attach to window for onclick handlers
window.sendChatMessage = sendChatMessage;
