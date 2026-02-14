// ═══════════════════════════════════════════
// INFINITE Dashboard - Tab: Treasury
// ═══════════════════════════════════════════

import { STATE } from '../state.js';

export function renderTreasury() {
  const t = STATE.treasury;
  const hasSol = t.treasuryBalanceSol > 0;
  const solDisplay = hasSol ? t.treasuryBalanceSol.toFixed(4) : '0';
  const usdDisplay = hasSol ? '$' + t.treasuryBalanceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '$0';
  const priceDisplay = t.solPrice > 0 ? '$' + t.solPrice.toFixed(2) : '—';
  const statusColor = {
    surplus: 'var(--green)', healthy: 'var(--accent)', cautious: '#febc2e',
    critical: 'var(--red)', unknown: 'var(--text-muted)'
  }[t.healthStatus] || 'var(--text-muted)';
  return `
    <div class="page-header">
      <h1 class="page-title">Treasury</h1>
      <p class="page-sub">Live protocol treasury balance. Funded by pump.fun creator fees.</p>
    </div>
    <div class="stats-row">
      <div class="stat-card"><div class="label">SOL Balance</div><div class="value accent">${solDisplay}</div><div class="sub">${usdDisplay} USD${t.wallet ? ' &middot; ' + t.wallet : ''}</div></div>
      <div class="stat-card"><div class="label">SOL Price</div><div class="value">${priceDisplay}</div><div class="sub">via Jupiter</div></div>
      <div class="stat-card"><div class="label">Health Status</div><div class="value" style="color:${statusColor};text-transform:uppercase;">${t.healthStatus}</div><div class="sub">rate multiplier: ${t.multiplier}x</div></div>
      <div class="stat-card"><div class="label">Runway</div><div class="value">${t.runwayDays || '—'}</div><div class="sub">days at current usage</div></div>
    </div>
    <div class="section">
      <div class="section-title">How Treasury Works</div>
      <div class="api-key-box">
        <div class="api-key-hint" style="line-height:2;">
          Creator fees from the $INFINITE token on pump.fun are split:<br>
          <strong style="color:var(--text)">50%</strong> - API treasury (pays for Claude + Gemini calls)<br>
          <strong style="color:var(--text)">40%</strong> - Dev operations<br>
          <strong style="color:var(--text)">10%</strong> - Community fund<br><br>
          You claim fees and move them to the treasury wallet. The balance updates every 5 minutes.
        </div>
      </div>
    </div>
  `;
}
