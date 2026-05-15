import { STATE } from './state.js';
import { escapeHtml } from './utils.js';

const NUMERIC_RE = /[-+]?\d[\d,]*\.?\d*/;
const counterTargets = new WeakMap();

export function tweenNumericText(el, target = el.textContent || '', duration = 850) {
  const match = target.match(NUMERIC_RE);
  if (!match) {
    el.textContent = target;
    return;
  }

  const raw = match[0].replace(/,/g, '');
  const end = Number(raw);
  if (!Number.isFinite(end)) {
    el.textContent = target;
    return;
  }

  const decimals = (raw.split('.')[1] || '').length;
  const prefix = target.slice(0, match.index);
  const suffix = target.slice((match.index ?? 0) + match[0].length);
  const useGrouping = match[0].includes(',');
  const start = 0;
  const startedAt = performance.now();
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  function tick(now) {
    const progress = Math.min((now - startedAt) / duration, 1);
    const value = start + (end - start) * easeOut(progress);
    const formatted = value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping,
    });
    el.textContent = `${prefix}${formatted}${suffix}`;
    if (progress < 1) requestAnimationFrame(tick);
    else el.textContent = target;
  }

  requestAnimationFrame(tick);
}

export function animateDashboardCounters(scope = document) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  scope.querySelectorAll('.stat-card .value, .usage-count, .receipt-summary-strip span, [data-countup]').forEach(el => {
    const target = (el.getAttribute('data-countup') || el.textContent || '').trim();
    if (!NUMERIC_RE.test(target)) return;
    if (counterTargets.get(el) === target) return;
    counterTargets.set(el, target);
    tweenNumericText(el, target);
  });
}

export function renderSkeletonCards(count = 4) {
  return Array.from({ length: count }, (_, i) => `
    <div class="stat-card skeleton dashboard-skeleton-card">
      <div class="skeleton-line skeleton-line--label"></div>
      <div class="skeleton-line skeleton-line--value"></div>
      <div class="skeleton-line skeleton-line--sub ${i % 2 ? 'short' : ''}"></div>
    </div>
  `).join('');
}

export function renderSkeletonTable(columns = 7, rows = 6) {
  return `
    <div class="tool-config-box receipt-table-wrap skeleton-table-wrap" aria-busy="true" aria-label="Loading rows">
      <table class="treasury-table skeleton-table">
        <thead>
          <tr>${Array.from({ length: columns }, (_, i) => `<th><span class="skeleton-line ${i % 2 ? 'short' : ''}"></span></th>`).join('')}</tr>
        </thead>
        <tbody>
          ${Array.from({ length: rows }, () => `
            <tr>${Array.from({ length: columns }, (_, i) => `<td><span class="skeleton-line ${i % 3 === 0 ? 'wide' : i % 2 ? 'short' : ''}"></span></td>`).join('')}</tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function renderSkeletonGrid(count = 4) {
  return `
    <div class="tools-grid skeleton-grid" aria-busy="true">
      ${Array.from({ length: count }, () => `
        <div class="tool-card skeleton-panel">
          <div class="skeleton-line skeleton-line--label"></div>
          <div class="skeleton-line skeleton-line--title"></div>
          <div class="skeleton-line wide"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
      `).join('')}
    </div>
  `;
}

export function renderEmptyState({ variant = 'meters', title, body, ctaLabel, action }) {
  const safeAction = action || 'setTab(\'overview\')';
  return `
    <div class="empty-state empty-state--${escapeHtml(variant)}">
      <svg class="empty-state-art" viewBox="0 0 96 72" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="emptyGrad-${escapeHtml(variant)}" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stop-color="currentColor" stop-opacity="0.9"/>
            <stop offset="100%" stop-color="currentColor" stop-opacity="0.18"/>
          </linearGradient>
        </defs>
        <rect x="14" y="18" width="68" height="38" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
        <path d="M25 43h13l7-14 9 21 7-11h10" fill="none" stroke="url(#emptyGrad-${escapeHtml(variant)})" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="24" cy="29" r="3" fill="currentColor" opacity="0.55"/>
        <circle cx="72" cy="28" r="3" fill="currentColor" opacity="0.28"/>
      </svg>
      <div class="empty-state-title">${escapeHtml(title)}</div>
      <div class="empty-state-desc">${escapeHtml(body)}</div>
      <button class="btn-sm primary" onclick="${safeAction}">${escapeHtml(ctaLabel)}</button>
    </div>
  `;
}

export function renderUsageSegments(usage = STATE.usage, usagePct = 0, usageBarClass = '') {
  const limit = Number(usage.limit || 0);
  const today = Number(usage.today || 0);
  const segmentCount = Math.max(1, Math.min(12, Math.ceil((limit || 100) / 100)));
  const currentSegment = Math.min(segmentCount - 1, Math.max(0, Math.floor(today / 100)));
  const segmentSize = limit > 0 ? limit / segmentCount : 100;
  const usedSegments = limit > 0 ? Math.ceil(today / segmentSize) : 0;

  return `
    <div class="sidebar-usage-track sidebar-usage-track--segmented" style="--progress-value:${usagePct}%; --usage-segments:${segmentCount}">
      ${Array.from({ length: segmentCount }, (_, i) => {
        const classes = [
          'sidebar-usage-segment',
          i < usedSegments ? 'used' : '',
          i === currentSegment ? 'current' : '',
          usageBarClass,
        ].filter(Boolean).join(' ');
        return `<span class="${classes}"></span>`;
      }).join('')}
    </div>
  `;
}

export function renderWalletCard({ compact = false } = {}) {
  const wallet = STATE.wallet || '';
  const short = wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : 'No wallet';
  const hue = hashHue(wallet || STATE.apiKeyFull || 'meterflow');
  const usdc = Number(STATE.treasury?.treasuryBalanceUsdc || STATE.treasury?.usdcBalance || 0);
  const settled = Number(STATE.treasury?.settledThisMonthUsd || STATE.treasury?.monthlySettledUsd || 0);
  const title = STATE.isGuest ? 'Guest Access' : (STATE.tier ? `${STATE.tier} Tier` : 'Connected Wallet');
  const symbol = STATE.token?.symbol || 'MFLOW';
  const utility = Number(STATE.balance || 0).toLocaleString();

  return `
    <div class="sidebar-wallet-card${compact ? ' compact' : ''}" style="--wallet-hue:${hue}deg; --wallet-hue-2:${(hue + 64) % 360}deg">
      <div class="sidebar-wallet-top">
        <div class="sidebar-wallet-avatar" aria-hidden="true">${escapeHtml((wallet || 'MF').slice(0, 2).toUpperCase())}</div>
        <div class="sidebar-wallet-main">
          <div class="sidebar-wallet-title" id="sidebarFooterInfo">${escapeHtml(title)}</div>
          <button class="sidebar-wallet-address" onclick="copyText('${escapeHtml(wallet)}')" ${wallet ? '' : 'disabled'} title="${wallet ? 'Copy wallet address' : ''}">
            ${escapeHtml(short)}
            ${wallet ? '<span>COPY</span>' : ''}
          </button>
        </div>
      </div>
      <div class="sidebar-wallet-metrics">
        <div><span>USDC</span><strong>${formatUsd(usdc)}</strong></div>
        <div><span>Month</span><strong>${formatUsd(settled)}</strong></div>
        <div><span>${escapeHtml(symbol)}</span><strong>${utility}</strong></div>
      </div>
      <div class="sidebar-wallet-actions">
        ${wallet ? `<button class="btn-sm" onclick="copyText('${escapeHtml(wallet)}')">Copy</button>` : ''}
        <button class="btn-sm danger" onclick="disconnectWallet()">Disconnect</button>
      </div>
    </div>
  `;
}

function hashHue(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
}

function formatUsd(value) {
  return `$${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  })}`;
}
