// Command Palette — cmd+k / ctrl+k tab + action switcher
import { setTab } from './actions.js';

const COMMANDS = [
  { id: 'overview', label: 'Overview', icon: '01', tab: 'overview', keywords: 'home dashboard start' },
  { id: 'meters', label: 'Meters', icon: '02', tab: 'meters', keywords: 'price routes endpoint' },
  { id: 'receipts', label: 'Receipts', icon: '03', tab: 'receipts', keywords: 'logs payments audit history' },
  { id: 'budgets', label: 'Agent Budgets', icon: '04', tab: 'budgets', keywords: 'limit cap spend agent autonomous' },
  { id: 'mcp-tools', label: 'MCP Tools', icon: '05', tab: 'mcp-tools', keywords: 'package tool capability' },
  { id: 'webhooks', label: 'Webhooks', icon: '06', tab: 'webhooks', keywords: 'events receipt payment budget signed delivery' },
  { id: 'keys', label: 'API Keys', icon: '07', tab: 'keys', keywords: 'auth token credential developer' },
  { id: 'models', label: 'Service Routes', icon: '08', tab: 'models', keywords: 'ai model gateway claude gpt' },
  { id: 'connections', label: 'Connections', icon: '09', tab: 'connections', keywords: 'oauth provider connect' },
  { id: 'treasury', label: 'Settlement Wallet', icon: '10', tab: 'treasury', keywords: 'usdc solana balance treasury' },
  { id: 'future-apis', label: 'Integrations', icon: '11', tab: 'future-apis', keywords: 'helius jupiter phantom discord webhook' },
  { id: 'docs', label: 'Open Docs', icon: '↗', url: '/docs', keywords: 'documentation help guide' },
  { id: 'roadmap', label: 'View Roadmap', icon: '↗', url: '/roadmap', keywords: 'plan milestones' },
  { id: 'home', label: 'Back to Site', icon: '↗', url: '/', keywords: 'landing meterflow' },
];

let isOpen = false;
let selectedIdx = 0;
let filtered = COMMANDS;

function open() {
  // Re-sync state with DOM in case overlay was removed externally
  isOpen = !!document.getElementById('cmdkOverlay');
  if (isOpen) return;
  isOpen = true;
  selectedIdx = 0;
  filtered = COMMANDS;
  render();
  setTimeout(() => document.querySelector('#cmdkInput')?.focus(), 0);
}

function close() {
  if (!isOpen) return;
  isOpen = false;
  document.getElementById('cmdkOverlay')?.remove();
}

function execute(cmd) {
  close();
  if (cmd.tab) setTab(cmd.tab);
  else if (cmd.url) window.location.href = cmd.url;
}

function filter(query) {
  const q = query.trim().toLowerCase();
  if (!q) { filtered = COMMANDS; selectedIdx = 0; render(); return; }
  filtered = COMMANDS.filter(c => {
    const hay = (c.label + ' ' + c.keywords + ' ' + c.id).toLowerCase();
    return q.split(/\s+/).every(part => hay.includes(part));
  });
  selectedIdx = 0;
  render();
}

function render() {
  let overlay = document.getElementById('cmdkOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'cmdkOverlay';
    overlay.className = 'cmdk-overlay';
    overlay.innerHTML = `
      <div class="cmdk-panel" role="dialog" aria-label="Command palette">
        <div class="cmdk-input-row">
          <span class="cmdk-input-icon">⌘</span>
          <input id="cmdkInput" class="cmdk-input" type="text" placeholder="Jump to a tab or run a command…" autocomplete="off" spellcheck="false">
          <span class="cmdk-kbd">ESC</span>
        </div>
        <div id="cmdkResults" class="cmdk-results"></div>
        <div class="cmdk-footer">
          <span><span class="cmdk-kbd">↑↓</span> navigate</span>
          <span><span class="cmdk-kbd">↵</span> select</span>
          <span><span class="cmdk-kbd">⌘K</span> toggle</span>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    const input = overlay.querySelector('#cmdkInput');
    input.addEventListener('input', e => filter(e.target.value));
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(filtered.length - 1, selectedIdx + 1); renderResults(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(0, selectedIdx - 1); renderResults(); return; }
      if (e.key === 'Enter') { e.preventDefault(); if (filtered[selectedIdx]) execute(filtered[selectedIdx]); return; }
    });
  }
  renderResults();
}

function renderResults() {
  const list = document.getElementById('cmdkResults');
  if (!list) return;
  if (filtered.length === 0) {
    list.innerHTML = '<div class="cmdk-empty">No matches. Try "meters" or "receipts".</div>';
    return;
  }
  list.innerHTML = filtered.map((c, i) => `
    <div class="cmdk-result ${i === selectedIdx ? 'selected' : ''}" data-idx="${i}">
      <span class="cmdk-result-icon">${c.icon}</span>
      <span>${c.label}</span>
      <span class="cmdk-result-meta">${c.tab ? 'Tab' : 'Link'}</span>
    </div>
  `).join('');
  list.querySelectorAll('.cmdk-result').forEach(el => {
    el.addEventListener('click', () => execute(filtered[Number(el.dataset.idx)]));
    el.addEventListener('mouseenter', () => {
      selectedIdx = Number(el.dataset.idx);
      list.querySelectorAll('.cmdk-result').forEach((e, i) => e.classList.toggle('selected', i === selectedIdx));
    });
  });
  // Scroll selected into view
  list.querySelector('.cmdk-result.selected')?.scrollIntoView({ block: 'nearest' });
}

document.addEventListener('keydown', e => {
  // cmd+k or ctrl+k
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    isOpen ? close() : open();
  }
});

window.openCommandPalette = open;
