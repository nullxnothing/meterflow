// ═══════════════════════════════════════════
// Meterflow Dashboard - Render Module
// ═══════════════════════════════════════════

import { STATE } from './state.js';
import { escapeHtml } from './utils.js';
import { getWalletProviders } from './wallet.js?v=v10-ledger';
import { bindEvents } from './events.js';
import { renderUsageSegments, renderWalletCard } from './ui.js';

// Tab renderers
import { renderOverview } from './tabs/overview.js?v=v12-onboard';
import { renderMeters, renderReceipts, renderBudgets, renderMcpTools, renderWebhooks } from './tabs/control-plane.js?v=v11-acceptance';
import { renderKeys } from './tabs/keys.js?v=v5-clean-mflow';
import { renderFutureApis } from './tabs/future-apis.js?v=logos-3';
import { renderHolderTools } from './tabs/holder-tools.js?v=agent-checkout-1';
import { renderTreasury } from './tabs/treasury.js?v=v5-clean-mflow';

const DEXSCREENER_URL = 'https://dexscreener.com/solana/gaghzanyewj7blbgwlyxnus1vgkdch33d8qzm4hwtkhy';
const DEXSCREENER_PATH = 'M 166 173 L 166 175 L 162 182 L 157 197 L 155 200 L 149 221 L 147 236 L 146 237 L 146 243 L 145 244 L 145 254 L 144 255 L 144 367 L 143 368 L 143 387 L 142 388 L 141 410 L 140 411 L 140 418 L 139 419 L 139 425 L 138 426 L 135 450 L 134 451 L 134 455 L 132 460 L 128 481 L 117 517 L 115 520 L 113 528 L 104 548 L 104 550 L 92 575 L 90 577 L 165 517 L 168 519 L 220 604 L 264 562 L 277 551 L 367 697 L 368 697 L 382 673 L 391 660 L 395 652 L 458 551 L 515 604 L 567 519 L 570 517 L 644 577 L 634 557 L 634 555 L 630 548 L 620 523 L 609 489 L 603 465 L 600 446 L 599 445 L 596 421 L 595 420 L 594 403 L 593 402 L 592 373 L 591 372 L 591 258 L 590 257 L 589 238 L 588 237 L 588 232 L 587 231 L 584 214 L 578 195 L 572 180 L 561 159 L 544 182 L 527 201 L 525 202 L 525 204 L 532 217 L 536 229 L 537 240 L 538 241 L 538 252 L 537 253 L 536 264 L 534 270 L 526 285 L 513 299 L 503 306 L 491 312 L 474 317 L 454 318 L 455 331 L 456 332 L 456 350 L 528 392 L 523 396 L 464 429 L 452 440 L 440 456 L 420 494 L 408 524 L 407 529 L 405 532 L 390 578 L 390 581 L 385 595 L 385 598 L 380 612 L 380 615 L 370 646 L 370 649 L 367 654 L 357 623 L 356 616 L 353 609 L 353 606 L 346 585 L 346 582 L 329 530 L 313 490 L 296 458 L 282 439 L 271 429 L 207 393 L 208 391 L 278 351 L 279 330 L 280 329 L 281 318 L 261 317 L 239 310 L 223 300 L 211 288 L 202 273 L 197 255 L 198 233 L 202 219 L 210 203 L 190 181 L 174 159 Z M 153 70 L 157 81 L 165 97 L 180 120 L 203 148 L 228 173 L 250 192 L 279 214 L 309 233 L 328 243 L 331 243 L 336 239 L 346 234 L 362 230 L 373 230 L 374 231 L 383 232 L 399 239 L 404 243 L 407 243 L 436 227 L 460 211 L 499 180 L 538 141 L 557 117 L 567 102 L 576 85 L 581 71 L 570 84 L 552 98 L 542 103 L 528 106 L 515 93 L 493 76 L 477 66 L 447 52 L 425 45 L 421 45 L 416 43 L 401 41 L 400 40 L 384 39 L 383 38 L 352 38 L 351 39 L 342 39 L 341 40 L 323 42 L 306 46 L 285 53 L 271 60 L 269 60 L 267 62 L 251 70 L 236 80 L 220 93 L 207 106 L 193 103 L 177 94 L 169 88 L 159 78 Z M 362 267 L 349 272 L 338 281 L 328 294 L 323 304 L 317 326 L 317 333 L 316 334 L 316 367 L 314 371 L 309 376 L 281 392 L 294 400 L 304 408 L 320 425 L 333 444 L 350 480 L 363 518 L 363 521 L 367 533 L 368 533 L 370 524 L 377 505 L 377 502 L 379 499 L 386 477 L 403 442 L 415 425 L 432 407 L 445 397 L 454 392 L 424 375 L 419 368 L 419 336 L 418 335 L 417 322 L 412 304 L 405 291 L 390 275 L 384 271 L 373 267 Z M 496 228 L 485 237 L 463 252 L 425 273 L 433 277 L 448 281 L 464 281 L 465 280 L 469 280 L 479 277 L 486 273 L 494 266 L 500 255 L 500 250 L 501 249 L 500 238 Z M 238 229 L 234 243 L 235 255 L 240 265 L 246 271 L 252 275 L 262 279 L 270 280 L 271 281 L 286 281 L 287 280 L 296 279 L 310 273 L 301 269 L 275 254 L 254 240 L 239 228 Z';
const DEXSCREENER_ICON = `<svg class="sidebar-social-icon--dexscreener" viewBox="0 0 736 736" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="${DEXSCREENER_PATH}"/></svg>`;

export function render() {
  const app = document.getElementById('app');
  app.className = 'app';
  app.innerHTML = renderDashboard();
  bindEvents();
}

// Kept for potential modal use but no longer gates the dashboard
export function renderConnectScreen() {
  const providers = getWalletProviders();
  const hasWallet = providers.length > 0;
  return `
    <div class="connect-screen">
      <div class="connect-box">
        <div class="logo"><img class="brand-mark" src="/assets/brand/meterflow-mark.svg" alt=""></div>
        <h1>Meterflow Dashboard</h1>
        <p>Connect your wallet to manage meters, receipts, agent budgets, MCP tools, webhooks, and API keys.</p>
        ${STATE.error ? `<div class="connect-error">${escapeHtml(STATE.error)}</div>` : ''}
        <div class="connect-wallets">
          ${STATE.connecting ? `<button class="connect-btn btn-loading u-connect-button" disabled>Connecting...</button>` : hasWallet ? providers.map((p, i) => `
            <button class="connect-btn${i > 0 ? ' connect-btn-secondary' : ''}" data-provider="${i}">
              <img src="${p.icon}" alt="${p.name}" width="20" height="20" class="u-provider-icon">
              Connect ${p.name}
            </button>
          `).join('') : `
            <button class="connect-btn" onclick="window.open('https://phantom.com/download','_blank')">Install Phantom Wallet</button>
          `}
        </div>
        <div class="connect-note">${hasWallet ? providers.map(p => p.name).join(', ') + ' detected' : 'No wallet detected'}</div>
      </div>
    </div>
  `;
}

export function renderDashboard() {
  const isChat = false;
  const hasKey = !!STATE.apiKeyFull;
  const usagePct = STATE.usage.limit > 0 ? Math.min((STATE.usage.today / STATE.usage.limit) * 100, 100) : 0;
  const usageBarClass = usagePct > 90 ? 'danger' : usagePct > 70 ? 'warning' : '';
  const resetTime = getResetCountdown();
  const usageSegments = renderUsageSegments(STATE.usage, usagePct, usageBarClass);
  return `
    <div class="mobile-header">
      <span class="mobile-logo"><img class="brand-mark" src="/assets/brand/meterflow-mark.svg" alt="">Meterflow</span>
      <div class="mobile-header-right">
        ${STATE.connected
          ? `<span class="mobile-tier">${STATE.isGuest ? 'Guest' : (STATE.tier || '')}</span>`
          : `<button class="btn-sm primary mobile-connect-btn" onclick="openWalletConnect()">Connect</button>`
        }
        <button class="mobile-hamburger" id="mobileMenuBtn">\u2630</button>
      </div>
    </div>
    <div class="mobile-nav-overlay" id="mobileNavOverlay">
      <div class="mobile-nav-drawer" id="mobileNavDrawer">
        <button class="mobile-nav-close" id="mobileNavClose">\u00d7</button>
        <div class="sidebar-logo u-mb-6"><img class="brand-mark" src="/assets/brand/meterflow-mark.svg" alt="">Meterflow</div>
        ${renderNavItems()}
        <div class="mobile-nav-account">
          ${STATE.connected && STATE.isGuest ? `
            <div class="wallet-info wallet-info-accent">Guest — Free Access</div>
            <button class="btn-primary u-action-full u-mt-2" onclick="openWalletConnect()">Connect Wallet to Keep Access</button>
          ` : STATE.connected ? `
            <div class="wallet-info">${STATE.tier ? STATE.tier + ' Tier' : 'Connected'} \u2014 ${(STATE.balance ?? 0).toLocaleString()} ${STATE.token?.symbol || 'MFLOW'}</div>
            <div class="wallet-addr" onclick="copyText('${STATE.wallet}')">${STATE.wallet ? STATE.wallet.slice(0, 6) + '...' + STATE.wallet.slice(-4) : '\u2014'}<span class="copy">COPY</span></div>
            <button class="btn-sm danger u-action-full-sm u-mt-1" onclick="disconnectWallet()">Disconnect</button>
          ` : `
            <button class="btn-primary u-action-full u-mt-2" onclick="openWalletConnect()">Connect Wallet</button>
          `}
        </div>
      </div>
    </div>
    <aside class="sidebar">
      <div class="sidebar-logo">
        <img class="brand-mark" src="/assets/brand/meterflow-mark.svg" alt="">
        Meterflow
        <span class="status-dot ${hasKey ? 'online' : 'offline'}" id="connectionDot" title="${hasKey ? 'Connected' : 'Not connected'}"></span>
      </div>
      <button class="sidebar-cmdk" onclick="openCommandPalette()" title="Search tabs (⌘K)">
        <span class="sidebar-cmdk-icon">⌕</span>
        <span class="sidebar-cmdk-label">Quick jump</span>
        <span class="sidebar-cmdk-kbd">⌘K</span>
      </button>
      <nav class="sidebar-nav">
        ${renderNavItems()}
      </nav>
      <div class="sidebar-footer">
        ${hasKey && STATE.isGuest ? `
          <div class="sidebar-usage" id="sidebarUsage">
            <div class="sidebar-usage-header">
              <span class="sidebar-usage-label">Metered Usage</span>
              <span class="sidebar-usage-count">${STATE.usage.limit === 0 ? '...' : STATE.usage.remaining.toLocaleString() + ' left'}</span>
            </div>
            ${usageSegments}
            <div class="sidebar-usage-reset">resets ${resetTime}</div>
          </div>
          <div class="wallet-info wallet-info-accent" id="sidebarFooterInfo">Guest — Free Access</div>
          <div class="sidebar-connect-cta u-mt-2">
            <div class="sidebar-connect-text">Connect wallet or use a paid Meterflow flow to keep access</div>
            <button class="btn-primary sidebar-connect-btn u-mt-2" onclick="openWalletConnect()">Connect Wallet</button>
          </div>
        ` : hasKey ? `
          <div class="sidebar-usage" id="sidebarUsage">
            <div class="sidebar-usage-header">
              <span class="sidebar-usage-label">Metered Usage</span>
              <span class="sidebar-usage-count">${STATE.usage.limit === 0 ? '...' : STATE.usage.remaining.toLocaleString() + ' left'}</span>
            </div>
            ${usageSegments}
            <div class="sidebar-usage-reset">resets ${resetTime}</div>
          </div>
          ${renderWalletCard()}
        ` : STATE.connected ? `
          ${renderWalletCard()}
        ` : `
          <div class="sidebar-connect-cta">
            <div class="sidebar-connect-text">Connect wallet to configure meters, budgets, receipts, and keys</div>
            <button class="btn-primary sidebar-connect-btn" onclick="openWalletConnect()">Connect Wallet</button>
          </div>
        `}
        <div class="sidebar-socials">
          <a href="https://x.com/meterflowsol" target="_blank" rel="noopener" class="sidebar-social-link" aria-label="Meterflow on X" title="X / Twitter">
            <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.844l-5.36-7.013L4.16 22H.9l8.025-9.17L1.5 2h6.97l4.84 6.4L18.244 2Zm-1.2 18h1.86L7.04 4H5.05l11.994 16Z"/></svg>
          </a>
          <a href="https://discord.gg/tned74z4eN" target="_blank" rel="noopener" class="sidebar-social-link" aria-label="Meterflow Discord" title="Discord">
            <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M19.27 5.33a17.6 17.6 0 0 0-4.43-1.38.07.07 0 0 0-.07.04c-.19.34-.4.78-.55 1.13a16.3 16.3 0 0 0-4.92 0c-.15-.36-.37-.79-.56-1.13a.07.07 0 0 0-.07-.04 17.6 17.6 0 0 0-4.43 1.38.06.06 0 0 0-.03.03A18.06 18.06 0 0 0 .73 17.51a.07.07 0 0 0 .03.05 17.7 17.7 0 0 0 5.34 2.7.07.07 0 0 0 .08-.03c.41-.56.78-1.16 1.1-1.79a.07.07 0 0 0-.04-.1 11.7 11.7 0 0 1-1.67-.8.07.07 0 0 1 0-.12c.11-.08.22-.17.33-.26a.07.07 0 0 1 .07 0 12.6 12.6 0 0 0 10.74 0 .07.07 0 0 1 .07 0c.11.09.22.18.33.26a.07.07 0 0 1 0 .12c-.53.31-1.09.58-1.67.8a.07.07 0 0 0-.04.1c.33.63.7 1.23 1.1 1.79a.07.07 0 0 0 .08.03 17.6 17.6 0 0 0 5.35-2.7.07.07 0 0 0 .03-.05 17.95 17.95 0 0 0-3.46-12.15.06.06 0 0 0-.03-.03ZM8.52 15.33c-1.06 0-1.93-.97-1.93-2.16 0-1.2.86-2.17 1.93-2.17 1.08 0 1.94.98 1.93 2.17 0 1.19-.86 2.16-1.93 2.16Zm6.97 0c-1.06 0-1.93-.97-1.93-2.16 0-1.2.85-2.17 1.93-2.17 1.08 0 1.94.98 1.93 2.17 0 1.19-.85 2.16-1.93 2.16Z"/></svg>
          </a>
          <a href="${DEXSCREENER_URL}" target="_blank" rel="noopener" class="sidebar-social-link" aria-label="MFLOW on DEX Screener" title="DEX Screener">
            ${DEXSCREENER_ICON}
          </a>
          <a href="https://github.com/nullxnothing/meterflow" target="_blank" rel="noopener" class="sidebar-social-link" aria-label="Meterflow on GitHub" title="GitHub">
            <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.05c-3.2.7-3.87-1.37-3.87-1.37-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.9-.39.99 0 1.98.13 2.9.39 2.21-1.49 3.18-1.18 3.18-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.06.78 2.13v3.16c0 .31.21.67.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z"/></svg>
          </a>
        </div>
        <div class="compliance-badge" title="Meterflow tracks usage, receipts, route access, and budget limits for agent-accessible APIs.">
          <span class="compliance-dot"></span> Metering Active
        </div>
      </div>
    </aside>
    <main class="main${isChat ? ' chat-mode' : ''}">${renderStatusBanner()}${renderTab()}</main>
  `;
}

function renderStatusBanner() {
  const s = STATE.providerStatus;
  if (!s || s.indicator === 'none') return '';
  const text = s.incident ? s.incident.name : s.description;
  return `
    <div class="status-banner status-banner--${s.indicator}" id="claudeStatusBanner">
      <span class="status-banner-dot"></span>
      <span class="status-banner-text">${escapeHtml(text)}</span>
      <button class="status-banner-close" onclick="this.parentElement.hidden=true" aria-label="Dismiss">&times;</button>
    </div>
  `;
}

function renderNavItems() {
  const t = STATE.activeTab;
  const receiptBadge = STATE.newReceiptCount > 0 ? `<span class="nav-new-count">${STATE.newReceiptCount > 9 ? '9+' : STATE.newReceiptCount}</span>` : '';
  const navItem = (tab, label) => `
    <div class="nav-item ${t === tab ? 'active' : ''}" data-tab="${tab}" title="${label}">
      <span class="nav-icon" aria-hidden="true">${navIcon(tab)}</span>
      <span class="nav-label">${label}</span>
      ${tab === 'receipts' ? receiptBadge : ''}
    </div>
  `;
  return `
    <div class="nav-group-label">Control Plane</div>
    ${navItem('overview', 'Overview')}
    ${navItem('meters', 'Meters')}
    ${navItem('receipts', 'Receipts')}
    ${navItem('budgets', 'Agent Budgets')}
    ${navItem('mcp-tools', 'MCP Tools')}
    ${navItem('webhooks', 'Webhooks')}
    ${navItem('keys', 'API Keys')}

    <div class="nav-group-label">Operations</div>
    ${navItem('holder-tools', 'Agent Checkout')}
    ${navItem('treasury', 'Settlement Wallet')}
    ${navItem('future-apis', 'Integrations')}
  `;
}

function navIcon(tab) {
  const icons = {
    overview: '<path d="M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M14 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/><path d="M4 16a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M14 14a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/>',
    meters: '<path d="M12 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M12 3v2"/><path d="M12 19v2"/><path d="M4.22 6.22l1.42 1.42"/><path d="M18.36 17.36l1.42 1.42"/><path d="M3 12h2"/><path d="M19 12h2"/><path d="M4.22 17.78l1.42-1.42"/><path d="M18.36 6.64l1.42-1.42"/>',
    receipts: '<path d="M8 21h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h4"/><path d="M6 19l2-1.5 2 1.5 2-1.5 2 1.5 2-1.5 2 1.5"/>',
    budgets: '<path d="M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0"/><path d="M12 7v5l3 3"/><path d="M17 3l4 4"/><path d="M21 3l-4 4"/>',
    'mcp-tools': '<path d="M8 8h8v8H8z"/><path d="M3 10h3"/><path d="M3 14h3"/><path d="M18 10h3"/><path d="M18 14h3"/><path d="M10 3v3"/><path d="M14 3v3"/><path d="M10 18v3"/><path d="M14 18v3"/>',
    webhooks: '<path d="M8 9a4 4 0 1 1 3 3.87"/><path d="M16 15a4 4 0 1 1-3-3.87"/><path d="M12 12l4-4"/><path d="M8 16l4-4"/><path d="M16 8h4v4"/><path d="M8 16H4v-4"/>',
    keys: '<path d="M7 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M10.5 10.5L21 21"/><path d="M16 16l2-2"/><path d="M18 18l2-2"/>',
    'holder-tools': '<path d="M12 3l7 4v5c0 4.5-2.8 7.6-7 9-4.2-1.4-7-4.5-7-9V7z"/><path d="M9.5 12.5l1.8 1.8 4.2-5.1"/>',
    treasury: '<path d="M3 21h18"/><path d="M4 10h16"/><path d="M5 6l7-3 7 3"/><path d="M6 10v8"/><path d="M10 10v8"/><path d="M14 10v8"/><path d="M18 10v8"/>',
    'future-apis': '<path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="M7.8 7.8l2.8 2.8"/><path d="M13.4 13.4l2.8 2.8"/><path d="M16.2 7.8l-2.8 2.8"/><path d="M10.6 13.4l-2.8 2.8"/><circle cx="12" cy="12" r="2.5"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">${icons[tab] || icons.overview}</svg>`;
}

function getResetCountdown() {
  const now = new Date();
  const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const diff = utcMidnight - now;
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `in ${hours}h ${mins}m`;
}

export function renderTab() {
  try {
    switch (STATE.activeTab) {
      case 'overview': return renderOverview();
      case 'meters': return renderMeters();
      case 'receipts': return renderReceipts();
      case 'budgets': return renderBudgets();
      case 'mcp-tools': return renderMcpTools();
      case 'webhooks': return renderWebhooks();
      case 'keys': return renderKeys();
      case 'future-apis': return renderFutureApis();
      case 'holder-tools': return renderHolderTools();
      case 'treasury': return renderTreasury();
      default: return renderOverview();
    }
  } catch (err) {
    console.error(`[Meterflow] Tab render error (${STATE.activeTab}):`, err);
    return `
      <div class="page-header">
        <h1 class="page-title">Something went wrong</h1>
        <p class="page-sub">This tab encountered an error. Try refreshing or switching tabs.</p>
      </div>
      <div class="u-error-panel">
        ${escapeHtml(err.message || 'Unknown error')}
      </div>
    `;
  }
}

// Fast tab switch — only updates <main> content + nav active states, preserves sidebar scroll
export function switchTabInPlace(tab) {
  const mainEl = document.querySelector('.main');
  if (!mainEl) return false;

  STATE.activeTab = tab;

  // Update main content
  mainEl.className = 'main';
  mainEl.innerHTML = renderStatusBanner() + renderTab();

  // Update nav active states (sidebar + mobile drawer)
  document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tab);
  });

  // Re-bind events scoped to main content only (sidebar already has listeners)
  bindEvents(mainEl);

  // Scroll main to top for new tab
  mainEl.scrollTop = 0;

  return true;
}
