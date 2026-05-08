// ═══════════════════════════════════════════
// Meterflow Dashboard - Markdown Renderer
// ═══════════════════════════════════════════

import { escapeHtml } from './utils.js';

let _cbCounter = 0;
function nextCbId() { return `cb_${++_cbCounter}`; }

export function renderMarkdown(text) {
  if (!text) return '';

  // Protect fenced code blocks from inline processing — extract before HTML escaping
  const codeBlockPlaceholders = [];
  let html = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const id = nextCbId();
    const trimmed = code.trimEnd();
    const lines = trimmed.split('\n');
    const langLabel = lang || 'code';
    const lineCount = lines.length;
    const hasLineNumbers = lineCount > 3;
    const isLong = lineCount > 10;

    // Store raw source for copy-to-clipboard; escapeHtml handles all special chars including quotes
    const escapedRaw = escapeHtml(trimmed);
    let codeBody;
    if (hasLineNumbers) {
      const numberedLines = lines.map((line, i) =>
        `<span class="line-number">${i + 1}</span>${escapeHtml(line)}`
      ).join('\n');
      codeBody = `<code id="${id}" class="has-line-numbers" data-raw="${escapedRaw}">${numberedLines}</code>`;
    } else {
      codeBody = `<code id="${id}" data-raw="${escapedRaw}">${escapeHtml(trimmed)}</code>`;
    }

    const toggleBtn = isLong ? `<button class="code-toggle" data-toggle-target="${id}">expand</button>` : '';
    const block = `<div class="code-block${isLong ? ' collapsed' : ''}" data-lines="${lineCount}"><div class="code-block-header"><span class="code-lang">${langLabel} <span class="code-lines">${lineCount} lines</span></span><div class="code-header-actions">${toggleBtn}<button class="code-copy" data-copy-id="${id}">copy</button></div></div><pre>${codeBody}</pre></div>`;

    const placeholder = `\x00cb${codeBlockPlaceholders.length}\x00`;
    codeBlockPlaceholders.push(block);
    return placeholder;
  });

  // Escape remaining HTML
  html = escapeHtml(html);

  // Inline code — content is already HTML-escaped at this point
  html = html.replace(/`([^`\n]+)`/g, (_, code) => `<code>${code}</code>`);

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold + Italic (order matters: *** before ** before *)
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists — collect consecutive li's and wrap in one <ul>
  html = html.replace(/((?:^- .+$\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map(line => `<li>${line.replace(/^- /, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });

  // Ordered lists — collect consecutive numbered lines and wrap in one <ol>
  html = html.replace(/((?:^\d+\. .+$\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map(line => `<li>${line.replace(/^\d+\. /, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Line breaks — skip inside block elements
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/<br>\s*(<\/?(ul|ol|li|pre|h[1-6]|blockquote|hr))/g, '$1');
  html = html.replace(/(<\/?(ul|ol|li|pre|h[1-6]|blockquote|hr)[^>]*>)\s*<br>/g, '$1');

  // Restore code block placeholders
  html = html.replace(/\x00cb(\d+)\x00/g, (_, i) => codeBlockPlaceholders[parseInt(i, 10)]);

  return html;
}
