// ═══════════════════════════════════════════
// INFINITE Dashboard — Holder Gate Component
// ═══════════════════════════════════════════

import { STATE } from './state.js';

export function isHolder() {
  return STATE.connected && !!STATE.apiKeyFull && STATE.tier !== 'Trial';
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

export function renderTrialBanner() {
  if (!isTrial()) return '';
  const { remaining, limit } = STATE.usage;
  if (remaining <= 0) return '';
  return `
    <div class="trial-banner">
      <span class="trial-banner-label">Free Trial</span>
      <span class="trial-banner-count">${remaining} of ${limit} calls remaining today</span>
      <span class="trial-banner-hint">Hold $INFINITE tokens for unlimited access</span>
    </div>
  `;
}

export function renderTrialExhausted() {
  return `
    <div class="holder-gate">
      <h2 class="holder-gate-title">Free Trial Used</h2>
      <p class="holder-gate-desc">
        You've used all <strong>${STATE.usage.limit} free calls</strong> for today.
        Hold <strong>$INFINITE</strong> tokens for unlimited access.
      </p>
      <div class="holder-gate-tiers">
        <div class="holder-gate-tier">
          <div class="holder-gate-tier-name">Signal</div>
          <div class="holder-gate-tier-req">10,000 $INF</div>
          <div class="holder-gate-tier-desc">1,000 calls/day</div>
        </div>
        <div class="holder-gate-tier">
          <div class="holder-gate-tier-name">Operator</div>
          <div class="holder-gate-tier-req">100,000 $INF</div>
          <div class="holder-gate-tier-desc">10,000 calls/day</div>
        </div>
        <div class="holder-gate-tier accent">
          <div class="holder-gate-tier-name">Architect</div>
          <div class="holder-gate-tier-req">1,000,000 $INF</div>
          <div class="holder-gate-tier-desc">Unlimited</div>
        </div>
      </div>
      <div class="holder-gate-balance">Your balance: <strong>${(STATE.balance ?? 0).toLocaleString()} $INF</strong></div>
    </div>
  `;
}

export function renderHolderGate(featureName = 'this feature') {
  const needsWallet = !STATE.connected;
  const trialUser = isTrial();
  return `
    <div class="holder-gate">
      <h2 class="holder-gate-title">Token-Gated Access</h2>
      <p class="holder-gate-desc">
        ${needsWallet
          ? `Connect your wallet and hold <strong>$INFINITE</strong> tokens to unlock ${featureName}.`
          : trialUser
            ? `Hold <strong>$INFINITE</strong> tokens to unlock ${featureName}. Your free trial only includes AI Chat.`
            : `Your wallet doesn't hold enough <strong>$INFINITE</strong> tokens to unlock ${featureName}.`
        }
      </p>
      <div class="holder-gate-tiers">
        <div class="holder-gate-tier">
          <div class="holder-gate-tier-name">Signal</div>
          <div class="holder-gate-tier-req">10,000 $INF</div>
          <div class="holder-gate-tier-desc">1,000 calls/day</div>
        </div>
        <div class="holder-gate-tier">
          <div class="holder-gate-tier-name">Operator</div>
          <div class="holder-gate-tier-req">100,000 $INF</div>
          <div class="holder-gate-tier-desc">10,000 calls/day</div>
        </div>
        <div class="holder-gate-tier accent">
          <div class="holder-gate-tier-name">Architect</div>
          <div class="holder-gate-tier-req">1,000,000 $INF</div>
          <div class="holder-gate-tier-desc">Unlimited</div>
        </div>
      </div>
      ${needsWallet ? `<button class="btn-primary holder-gate-btn" onclick="openWalletConnect()">Connect Wallet</button>` : `
        <div class="holder-gate-balance">Your balance: <strong>${(STATE.balance ?? 0).toLocaleString()} $INF</strong></div>
      `}
    </div>
  `;
}
