// ═══════════════════════════════════════════
// Meterflow Dashboard — Access Gate Component
// ═══════════════════════════════════════════

import { STATE } from './state.js';

export function isHolder() {
  return STATE.connected && !!STATE.apiKeyFull && (STATE.tier !== 'Trial' || STATE.isGuest);
}

export function hasMeterflowSession() {
  return STATE.connected && !!STATE.apiKeyFull && !STATE.isGuest;
}

export function canManageMeterflow() {
  return hasMeterflowSession();
}

export function isAlphaTier() {
  return STATE.connected && !!STATE.apiKeyFull && STATE.tier === 'Alpha';
}

export function isTrial() {
  return STATE.connected && !!STATE.apiKeyFull && STATE.tier === 'Trial';
}

export function hasTrialRemaining() {
  return isTrial() && STATE.usage.remaining > 0;
}

export function canAccessChat() {
  return isHolder() || hasTrialRemaining();
}

export function isFreeAccess() {
  return STATE.freeAccess && STATE.freeAccessEndsAt;
}

function formatCountdown(endsAt) {
  const remaining = new Date(endsAt).getTime() - Date.now();
  if (remaining <= 0) return 'expired';
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function renderFreeAccessBanner() {
  if (!isFreeAccess()) return '';
  const countdown = formatCountdown(STATE.freeAccessEndsAt);
  if (countdown === 'expired') return '';
  return `
    <div class="free-access-banner">
      <span class="free-access-banner-icon">&#9889;</span>
      <span class="free-access-banner-text">
        <strong>Free access active</strong> — expires in <strong>${countdown}</strong>
      </span>
      <span class="free-access-banner-hint">Use wallet-based keys for full control-plane access</span>
      <a href="/docs" class="free-access-banner-btn">Docs</a>
    </div>
  `;
}

export function renderTrialBanner() {
  if (isFreeAccess()) return renderFreeAccessBanner();
  if (!isTrial()) return '';
  const { remaining, limit } = STATE.usage;
  if (remaining <= 0) return '';
  return `
    <div class="trial-banner">
      <span class="trial-banner-label">Free Trial</span>
      <span class="trial-banner-count">${remaining} of ${limit} calls remaining today</span>
      <span class="trial-banner-hint">Paid endpoints stay available; non-holder usage includes the protocol fee</span>
    </div>
  `;
}

function renderTierGrid() {
  return `
    <div class="holder-gate-tiers">
      <div class="holder-gate-tier">
        <div class="holder-gate-tier-name">Signal</div>
        <div class="holder-gate-tier-req">MFLOW utility tier</div>
        <div class="holder-gate-tier-desc">1,000 calls/day</div>
      </div>
      <div class="holder-gate-tier">
        <div class="holder-gate-tier-name">Operator</div>
        <div class="holder-gate-tier-req">MFLOW utility tier</div>
        <div class="holder-gate-tier-desc">10,000 calls/day</div>
      </div>
      <div class="holder-gate-tier">
        <div class="holder-gate-tier-name">Architect</div>
        <div class="holder-gate-tier-req">MFLOW utility tier</div>
        <div class="holder-gate-tier-desc">Unlimited</div>
      </div>
      <div class="holder-gate-tier accent">
        <div class="holder-gate-tier-name">Alpha</div>
        <div class="holder-gate-tier-req">MFLOW utility tier</div>
        <div class="holder-gate-tier-desc">Unlimited + X Tools</div>
      </div>
    </div>
  `;
}

function feePct(bps) {
  return `${(Number(bps || 0) / 100).toFixed(Number(bps || 0) % 100 === 0 ? 0 : 2)}%`;
}

export function getTokenPurchaseUrl(preferUsdc = false) {
  return (preferUsdc && STATE.token?.usdcPurchaseUrl) || STATE.token?.purchaseUrl || STATE.token?.usdcPurchaseUrl || null;
}

export function openTokenPurchase(preferUsdc = false) {
  const url = getTokenPurchaseUrl(preferUsdc);
  if (!url) {
    window.showToast?.(`${STATE.token?.symbol || 'MFLOW'} launch mint is not configured yet.`, 'warning');
    return;
  }
  window.open(url, '_blank', 'noopener');
}

export function copyTokenMint() {
  const mint = STATE.token?.mint;
  if (!mint) {
    window.showToast?.('Token mint is not configured yet.', 'warning');
    return;
  }
  navigator.clipboard.writeText(mint).then(
    () => window.showToast?.('Token mint copied'),
    () => window.showToast?.('Copy failed', true),
  );
}

export function renderTokenUtilityPanel({ compact = false } = {}) {
  const token = STATE.token || {};
  const symbol = token.symbol || 'MFLOW';
  const holderFee = feePct(token.holderProtocolFeeBps);
  const nonHolderFee = feePct(token.nonHolderProtocolFeeBps);
  const currentFee = feePct(token.protocolFeeBps);
  const mint = token.mint || 'Launch mint pending';
  return `
    <div class="token-utility-panel ${compact ? 'compact' : ''}">
      <div class="token-utility-copy">
        <div class="token-utility-kicker">${symbol} Utility</div>
        <div class="token-utility-title">Hold ${symbol} to remove the non-holder protocol fee.</div>
        <div class="token-utility-desc">
          API and MCP calls settle in USDC. Non-holders pay a ${nonHolderFee} Meterflow protocol fee on metered usage; holders pay ${holderFee} and unlock higher limits, longer receipt retention, and provider controls.
        </div>
      </div>
      <div class="token-utility-actions">
        <div class="token-fee-chip">Current fee: <strong>${currentFee}</strong></div>
        <button class="btn-sm primary" onclick="openTokenPurchase()">Buy ${symbol}</button>
        <button class="btn-sm" onclick="openTokenPurchase(true)">Buy with USDC</button>
        <button class="btn-sm" onclick="copyTokenMint()">Copy Mint</button>
      </div>
      <div class="token-mint-row"><span>Mint</span><code>${mint}</code></div>
    </div>
  `;
}

export function renderPreviewNotice(featureName = 'this feature') {
  const needsWallet = !STATE.connected;
  const symbol = STATE.token?.symbol || 'MFLOW';
  return `
    <div class="preview-access-notice">
      <div>
        <div class="preview-access-label">Preview Mode</div>
        <div class="preview-access-text">
          You can inspect ${featureName}, but actions are disabled until ${needsWallet ? 'a wallet is connected' : 'the wallet holds Meterflow utility access or uses a paid flow'}.
          <a href="#overview" onclick="setTab('overview');return false;" class="preview-access-link">Hold ${symbol} to remove the 1% fee &rarr;</a>
        </div>
      </div>
      <div class="preview-access-actions">
        ${needsWallet ? `<button class="btn-sm primary" onclick="openWalletConnect()">Connect Wallet</button>` : ''}
        <button class="btn-sm" onclick="openTokenPurchase()">Buy ${symbol}</button>
      </div>
    </div>
  `;
}

export function renderTrialExhausted() {
  return `
    <div class="holder-gate">
      <h2 class="holder-gate-title">Free Trial Used</h2>
      <p class="holder-gate-desc">
        You've used all <strong>${STATE.usage.limit} free calls</strong> for today.
        Connect a wallet or issue a metered client key to continue.
      </p>
      ${renderTierGrid()}
      ${renderTokenUtilityPanel({ compact: true })}
      <div class="holder-gate-balance">Wallet utility balance: <strong>${(STATE.balance ?? 0).toLocaleString()} ${STATE.token?.symbol || 'MFLOW'}</strong></div>
    </div>
  `;
}

export function renderHolderGate(featureName = 'this feature') {
  const needsWallet = !STATE.connected;
  const trialUser = isTrial();
  return `
    <div class="holder-gate">
      <h2 class="holder-gate-title">Meterflow Access</h2>
      <p class="holder-gate-desc">
        ${needsWallet
          ? `Connect your wallet to unlock ${featureName}.`
          : trialUser
            ? `${featureName} requires Meterflow utility access. Paid endpoint management remains available with the non-holder protocol fee.`
            : `Your wallet does not currently unlock ${featureName}.`
        }
      </p>
      ${renderTierGrid()}
      ${needsWallet ? `<button class="btn-primary holder-gate-btn" onclick="openWalletConnect()">Connect Wallet</button>` : `
        <div class="holder-gate-balance">Wallet utility balance: <strong>${(STATE.balance ?? 0).toLocaleString()} ${STATE.token?.symbol || 'MFLOW'}</strong></div>
      `}
      ${renderTokenUtilityPanel({ compact: true })}
    </div>
  `;
}

export function renderAlphaGate() {
  const needsWallet = !STATE.connected;
  return `
    <div class="holder-gate">
      <h2 class="holder-gate-title">Alpha Tier Required</h2>
      <p class="holder-gate-desc">
        ${needsWallet
          ? `Connect your wallet to unlock X Tools.`
          : `X Tools requires <strong>Alpha tier</strong> access.`
        }
      </p>
      <div class="holder-gate-tiers">
        <div class="holder-gate-tier accent">
          <div class="holder-gate-tier-name">Alpha</div>
          <div class="holder-gate-tier-req">MFLOW utility tier</div>
          <div class="holder-gate-tier-desc">CT intelligence, profile scanning, discover feed, trending, alerts, watchlist</div>
        </div>
      </div>
      ${needsWallet ? `<button class="btn-primary holder-gate-btn" onclick="openWalletConnect()">Connect Wallet</button>` : `
        <div class="holder-gate-balance">Wallet utility balance: <strong>${(STATE.balance ?? 0).toLocaleString()} ${STATE.token?.symbol || 'MFLOW'}</strong></div>
      `}
      ${renderTokenUtilityPanel({ compact: true })}
    </div>
  `;
}

window.openTokenPurchase = openTokenPurchase;
window.copyTokenMint = copyTokenMint;
