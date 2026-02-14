// ═══════════════════════════════════════════
// INFINITE Dashboard - Tool Indicators & Results
// ═══════════════════════════════════════════

import { escapeHtml } from './api.js';
import { copyText } from './actions.js';

// ─── Tool Labels ───

export const TOOL_LABELS = {
  web_search: (q) => `Searching the web${q ? ` for "${escapeHtml(q)}"` : ''}...`,
  url_reader: (q) => `Reading URL${q ? `: ${escapeHtml(q.slice(0, 60))}` : ''}...`,
  code_runner: () => 'Running code...',
  github_lookup: (q) => `Looking up GitHub${q ? `: ${escapeHtml(q)}` : ''}...`,
  google_lookup: (q) => `Searching Google Drive${q ? `: ${escapeHtml(q)}` : ''}...`,
  notion_lookup: (q) => `Searching Notion${q ? `: ${escapeHtml(q)}` : ''}...`,
  image_generate: (q) => `Generating image${q ? `: "${escapeHtml(q.slice(0, 50))}${q.length > 50 ? '...' : ''}"` : ''}...`,
};

// ─── Tool Indicator Functions ───

export function showToolIndicator(bodyEl, tool, query) {
  if (!bodyEl) return;
  removeToolIndicator(bodyEl);
  const el = document.createElement('div');
  el.className = 'tool-indicator';
  const labelFn = TOOL_LABELS[tool] || TOOL_LABELS.web_search;
  el.innerHTML = `<div class="tool-spinner"></div><span>${labelFn(query)}</span>`;
  const contentEl = bodyEl.querySelector('.chat-msg-content');
  if (contentEl) bodyEl.insertBefore(el, contentEl);
  else bodyEl.appendChild(el);
  scrollChat();
}

export function removeToolIndicator(bodyEl) {
  if (!bodyEl) return;
  bodyEl.querySelector('.tool-indicator')?.remove();
}

export function showSearchSources(bodyEl, sources) {
  if (!bodyEl || !sources || sources.length === 0) return;
  bodyEl.querySelector('.search-sources')?.remove();
  const el = document.createElement('div');
  el.className = 'search-sources';
  el.innerHTML = sources.slice(0, 6).map(s => {
    let label = s.title;
    if (!label) try { label = new URL(s.url).hostname; } catch { label = s.url; }
    return `<a class="search-source-chip" href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
  }).join('');
  const contentEl = bodyEl.querySelector('.chat-msg-content');
  if (contentEl) bodyEl.insertBefore(el, contentEl);
  else bodyEl.appendChild(el);
  scrollChat();
}

// ─── Tool Result Cards ───

export function renderToolResultCardHtml(tool, data) {
  if (!data) return '';
  if (data.error) {
    return `<div class="tool-result-card"><div class="trc-header"><span class="trc-icon"></span>${escapeHtml(tool)}</div><div class="trc-error">${escapeHtml(data.error)}</div></div>`;
  }
  if (tool === 'url_reader') {
    const title = data.title || 'Untitled';
    const preview = (data.content || '').slice(0, 150).replace(/\n/g, ' ');
    let urlDisplay = '';
    if (data.url) try { urlDisplay = new URL(data.url).hostname; } catch { urlDisplay = data.url; }
    return `<div class="tool-result-card"><div class="trc-header"><span class="trc-icon"></span>URL READER</div><div class="trc-title">${data.url ? `<a href="${escapeHtml(data.url)}" target="_blank" rel="noopener">${escapeHtml(title)}</a>` : escapeHtml(title)}</div><div class="trc-body">${escapeHtml(preview)}${data.truncated ? '...' : ''}</div><div class="trc-meta"><span>${escapeHtml(urlDisplay)}</span></div></div>`;
  }
  if (tool === 'code_runner') {
    const displayText = data.output || data.returnValue || '(no output)';
    return `<div class="tool-result-card"><div class="trc-header"><span class="trc-icon"></span>CODE RUNNER</div><div class="trc-body code-output">${escapeHtml(displayText.slice(0, 500))}</div><div class="trc-meta">${data.executionTimeMs != null ? `<span>${data.executionTimeMs}ms</span>` : ''}</div></div>`;
  }
  if (tool === 'github_lookup') {
    if (data.name && data.stars !== undefined) {
      return `<div class="tool-result-card"><div class="trc-header"><span class="trc-icon"></span>GITHUB</div><div class="trc-title"><a href="${escapeHtml(data.url || '')}" target="_blank" rel="noopener">${escapeHtml(data.name)}</a></div><div class="trc-body">${escapeHtml(data.description || '')}</div><div class="trc-stats"><span class="trc-stat">Stars <span>${(data.stars || 0).toLocaleString()}</span></span><span class="trc-stat">Forks <span>${(data.forks || 0).toLocaleString()}</span></span></div></div>`;
    }
    if (data.type === 'file') {
      return `<div class="tool-result-card"><div class="trc-header"><span class="trc-icon"></span>GITHUB FILE</div><div class="trc-title">${escapeHtml(data.path || '')}</div><div class="trc-body code-output">${escapeHtml((data.content || '').slice(0, 300))}</div></div>`;
    }
    if (Array.isArray(data)) {
      return `<div class="tool-result-card"><div class="trc-header"><span class="trc-icon"></span>GITHUB ISSUES</div><div class="trc-body">${data.slice(0, 5).map(i => `#${i.number} ${escapeHtml(i.title)}`).join('<br>')}</div></div>`;
    }
  }
  if (tool === 'google_lookup') {
    if (data.files) {
      return `<div class="tool-result-card"><div class="trc-header"><span class="trc-icon"></span>GOOGLE DRIVE</div><div class="trc-body">${data.files.slice(0, 5).map(f => `<a href="${escapeHtml(f.url || '')}" target="_blank" rel="noopener">${escapeHtml(f.name)}</a>`).join('<br>')}</div><div class="trc-meta"><span>${data.files.length} files found</span></div></div>`;
    }
    if (data.title) {
      return `<div class="tool-result-card"><div class="trc-header"><span class="trc-icon"></span>GOOGLE DOC</div><div class="trc-title">${escapeHtml(data.title)}</div><div class="trc-body">${escapeHtml((data.content || '').slice(0, 200))}</div></div>`;
    }
  }
  if (tool === 'notion_lookup') {
    if (data.results) {
      return `<div class="tool-result-card"><div class="trc-header"><span class="trc-icon"></span>NOTION</div><div class="trc-body">${data.results.slice(0, 5).map(r => `<a href="${escapeHtml(r.url || '')}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a> <span class="dim">${r.type}</span>`).join('<br>')}</div></div>`;
    }
    if (data.title) {
      return `<div class="tool-result-card"><div class="trc-header"><span class="trc-icon"></span>NOTION PAGE</div><div class="trc-title">${escapeHtml(data.title)}</div><div class="trc-body">${escapeHtml((data.content || '').slice(0, 200))}</div></div>`;
    }
    if (data.entries) {
      return `<div class="tool-result-card"><div class="trc-header"><span class="trc-icon"></span>NOTION DATABASE</div><div class="trc-body">${data.entries.slice(0, 5).map(e => escapeHtml(JSON.stringify(e.properties).slice(0, 80))).join('<br>')}</div><div class="trc-meta"><span>${data.total} entries</span></div></div>`;
    }
  }
  if (tool === 'image_generate') {
    if (data.success && data.images && data.images.length > 0) {
      const imagesHtml = data.images.map(img => 
        `<img src="data:${img.mimeType};base64,${img.data}" alt="Generated image" class="generated-image" style="max-width:100%;border-radius:8px;margin:8px 0;">`
      ).join('');
      return `<div class="tool-result-card image-result" style="max-width:512px;"><div class="trc-header"><span class="trc-icon"></span>GENERATED IMAGE</div>${imagesHtml}${data.text ? `<div class="trc-body" style="margin-top:8px;">${escapeHtml(data.text)}</div>` : ''}<div class="trc-meta"><span>${escapeHtml(data.prompt?.slice(0, 50) || '')}${(data.prompt?.length || 0) > 50 ? '...' : ''}</span></div></div>`;
    }
    return `<div class="tool-result-card"><div class="trc-header"><span class="trc-icon"></span>IMAGE GENERATION</div><div class="trc-error">${escapeHtml(data.message || data.error || 'Failed to generate image')}</div></div>`;
  }
  return `<div class="tool-result-card"><div class="trc-header"><span class="trc-icon"></span>${escapeHtml(tool)}</div><div class="trc-body">${escapeHtml(JSON.stringify(data).slice(0, 200))}</div></div>`;
}

export function showToolResultCard(bodyEl, tool, data) {
  if (!bodyEl || !data) return;
  const el = document.createElement('div');
  el.innerHTML = renderToolResultCardHtml(tool, data);
  
  const contentEl = bodyEl.querySelector('.chat-msg-content');
  if (contentEl) bodyEl.insertBefore(el.firstChild, contentEl);
  else bodyEl.appendChild(el.firstChild);
  scrollChat();
}

// ─── Code Copy Buttons ───

export function bindCodeCopyButtons() {
  document.querySelectorAll('.code-copy[data-copy-id]').forEach(btn => {
    btn.onclick = () => {
      const code = document.getElementById(btn.dataset.copyId);
      if (code) copyText(code.textContent);
    };
  });
}

// ─── Helper ───

function scrollChat() {
  const el = document.getElementById('chatMessages');
  if (el) el.scrollTop = el.scrollHeight;
}
