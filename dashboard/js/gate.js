// ═══════════════════════════════════════════
// INFINITE Dashboard — Holder Gate Component
// ═══════════════════════════════════════════

import { STATE } from './state.js';

export function isHolder() {
  return STATE.connected && !!STATE.apiKeyFull && (STATE.tier !== 'Trial' || STATE.isGuest);
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
      <span class="free-access-banner-hint">Hold $INFINITE tokens to keep access after it ends</span>
      <a href="https://pump.fun/coin/DhsN1JmBZCvcL9P7cK1R9NLy5VB1kQcecUG7JbKQpump" target="_blank" rel="noopener" class="free-access-banner-btn">Buy $INFINITE</a>
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
        <div class="holder-gate-tier">
          <div class="holder-gate-tier-name">Architect</div>
          <div class="holder-gate-tier-req">1,000,000 $INF</div>
          <div class="holder-gate-tier-desc">Unlimited</div>
        </div>
        <div class="holder-gate-tier accent">
          <div class="holder-gate-tier-name">Alpha</div>
          <div class="holder-gate-tier-req">10,000,000 $INF</div>
          <div class="holder-gate-tier-desc">Unlimited + X Tools</div>
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
        <div class="holder-gate-tier">
          <div class="holder-gate-tier-name">Architect</div>
          <div class="holder-gate-tier-req">1,000,000 $INF</div>
          <div class="holder-gate-tier-desc">Unlimited</div>
        </div>
        <div class="holder-gate-tier accent">
          <div class="holder-gate-tier-name">Alpha</div>
          <div class="holder-gate-tier-req">10,000,000 $INF</div>
          <div class="holder-gate-tier-desc">Unlimited + X Tools</div>
        </div>
      </div>
      ${needsWallet ? `<button class="btn-primary holder-gate-btn" onclick="openWalletConnect()">Connect Wallet</button>` : `
        <div class="holder-gate-balance">Your balance: <strong>${(STATE.balance ?? 0).toLocaleString()} $INF</strong></div>
      `}
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
          ? `Connect your wallet and hold <strong>10,000,000 $INF</strong> to unlock X Tools.`
          : `X Tools requires <strong>Alpha tier</strong>. Hold <strong>10,000,000 $INF</strong> to access CT intelligence tools.`
        }
      </p>
      <div class="holder-gate-tiers">
        <div class="holder-gate-tier accent">
          <div class="holder-gate-tier-name">Alpha</div>
          <div class="holder-gate-tier-req">10,000,000 $INF</div>
          <div class="holder-gate-tier-desc">CT intelligence, profile scanning, discover feed, trending, alerts, watchlist</div>
        </div>
      </div>
      ${needsWallet ? `<button class="btn-primary holder-gate-btn" onclick="openWalletConnect()">Connect Wallet</button>` : `
        <div class="holder-gate-balance">Your balance: <strong>${(STATE.balance ?? 0).toLocaleString()} $INF</strong></div>
      `}
    </div>
  `;
}
