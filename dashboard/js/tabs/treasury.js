// ═══════════════════════════════════════════
// Meterflow Dashboard - Tab: Settlement Wallet
// ═══════════════════════════════════════════

import { STATE } from '../state.js';

const HEALTH_TIERS = [
  { key: 'surplus',  label: 'Surplus',  multiplier: '1.5x', desc: 'Settlement buffer exceeds 60-day runway. Extra test capacity available.' },
  { key: 'healthy',  label: 'Healthy',  multiplier: '1.0x', desc: 'Normal operations. Standard meter limits apply.' },
  { key: 'cautious', label: 'Cautious', multiplier: '0.7x', desc: 'Runway below 30 days. Expensive routes are throttled.' },
  { key: 'critical', label: 'Critical', multiplier: '0.3x', desc: 'Runway below 14 days. Only core routes stay active.' },
];

const STATUS_COLORS = {
  surplus: 'var(--green)', healthy: 'var(--accent)', cautious: '#febc2e',
  critical: 'var(--red)', unknown: 'var(--text-muted)',
};

function fmtSol(val) {
  return val > 0 ? val.toFixed(4) : '0';
}

function fmtUsd(val) {
  return val > 0 ? '$' + val.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '$0';
}

function truncateWallet(addr) {
  if (!addr) return '—';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

export function renderTreasury() {
  const t = STATE.treasury;
  const statusColor = STATUS_COLORS[t.healthStatus] || STATUS_COLORS.unknown;
  const wallet = t.wallet || '';
  const isFullWallet = wallet.length > 20;
  const solscanUrl = isFullWallet ? `https://solscan.io/account/${wallet}` : '#';

  return `
    <div class="page-header">
      <h1 class="page-title">Settlement Wallet</h1>
      <p class="page-sub">On-chain wallet context for settlement, provider funding, gateway costs, and control-plane operations.</p>
    </div>

    ${renderBalanceCards(t, statusColor)}
    ${renderFeeDistribution()}
    ${renderWalletVerify(wallet, isFullWallet, solscanUrl)}
    ${renderHealthTable(t, statusColor)}
    ${renderMultiplierImpact(t)}
  `;
}

function renderBalanceCards(t, statusColor) {
  const priceDisplay = t.solPrice > 0 ? '$' + t.solPrice.toFixed(2) : '—';
  return `
    <div class="stats-row">
      <div class="stat-card">
        <div class="label">USDC Settlement</div>
        <div class="value accent">${fmtUsd(t.treasuryBalanceUsdc || 0)}</div>
        <div class="sub">${fmtUsd(t.treasuryBalanceUsd)} USD</div>
      </div>
      <div class="stat-card">
        <div class="label">SOL Fee Buffer</div>
        <div class="value">${fmtSol(t.treasuryBalanceSol)}</div>
        <div class="sub">${priceDisplay} SOL reference</div>
      </div>
      <div class="stat-card">
        <div class="label">Buffer Status</div>
        <div class="value" style="color:${statusColor};text-transform:uppercase;">${t.healthStatus}</div>
        <div class="sub">multiplier: ${t.multiplier}x</div>
      </div>
      <div class="stat-card">
        <div class="label">Runway</div>
        <div class="value">${t.runwayDays >= 999 ? '∞' : t.runwayDays || '—'}</div>
        <div class="sub">${t.runwayDays >= 999 ? 'no active spend' : 'days at current route cost'}</div>
      </div>
      <div class="stat-card">
        <div class="label">Daily Capacity</div>
        <div class="value">${t.dailyBudget ? t.dailyBudget.toLocaleString() : '—'}</div>
        <div class="sub">metered calls fundable today</div>
      </div>
      <div class="stat-card">
        <div class="label">Meter Clients</div>
        <div class="value green">${t.totalKeysIssued != null ? t.totalKeysIssued.toLocaleString() : '—'}</div>
        <div class="sub">issued keys</div>
      </div>
    </div>
  `;
}

function renderFeeDistribution() {
  return `
    <div class="section">
      <div class="section-title">Settlement Distribution</div>
      <div class="treasury-fee-card">
        <div class="fee-bar-container">
          <div class="fee-bar">
            <div class="fee-segment treasury-seg" style="width:50%"><span>50%</span></div>
            <div class="fee-segment dev-seg" style="width:40%"><span>40%</span></div>
            <div class="fee-segment community-seg" style="width:10%"><span>10%</span></div>
          </div>
          <div class="fee-legend">
            <div class="fee-legend-item">
              <div class="fee-legend-dot" style="background:var(--accent)"></div>
              <div>
                <div class="fee-legend-label">Provider Costs</div>
                <div class="fee-legend-desc">Funds model, data, media, and other upstream service routes</div>
              </div>
            </div>
            <div class="fee-legend-item">
              <div class="fee-legend-dot" style="background:var(--text-dim)"></div>
              <div>
                <div class="fee-legend-label">Meterflow Ops</div>
                <div class="fee-legend-desc">Gateway infrastructure, receipt storage, monitoring, and maintenance</div>
              </div>
            </div>
            <div class="fee-legend-item">
              <div class="fee-legend-dot" style="background:var(--green)"></div>
              <div>
                <div class="fee-legend-label">Builder Programs</div>
                <div class="fee-legend-desc">Credits, integrations, bounties, and endpoint onboarding</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderWalletVerify(wallet, isFullWallet, solscanUrl) {
  if (!isFullWallet) return '';
  return `
    <div class="section">
      <div class="section-title">On-Chain Verification</div>
      <div class="treasury-wallet-card">
        <div class="treasury-wallet-row">
          <div class="treasury-wallet-info">
            <div class="treasury-wallet-label">Settlement Wallet</div>
            <div class="treasury-wallet-addr" onclick="copyText('${wallet}')" title="Click to copy">${wallet}<span class="copy">COPY</span></div>
          </div>
          <a href="${solscanUrl}" target="_blank" rel="noopener" class="btn-sm primary treasury-verify-btn">Verify on Solscan</a>
        </div>
        <div class="treasury-wallet-note">Settlement funds are on-chain. Click the address to copy or verify the balance directly on Solscan.</div>
      </div>
    </div>
  `;
}

function renderHealthTable(t, statusColor) {
  const rows = HEALTH_TIERS.map(h => {
    const isCurrent = h.key === t.healthStatus;
    return `
      <tr class="${isCurrent ? 'health-row-active' : ''}">
        <td><span class="health-badge" style="background:${STATUS_COLORS[h.key]}">${h.label}</span></td>
        <td class="mono">${h.multiplier}</td>
        <td>${h.desc}</td>
        <td>${isCurrent ? '<span class="health-current">CURRENT</span>' : ''}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="section">
      <div class="section-title">Buffer Status Tiers</div>
      <div class="treasury-table-wrap">
        <table class="treasury-table">
          <thead><tr><th>Status</th><th>Multiplier</th><th>Description</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderMultiplierImpact(t) {
  const tiers = t.tiers;
  if (!tiers || !tiers.length) return '';

  const rows = tiers.map(tier => `
    <tr>
      <td><span class="tier-badge">${tier.name}</span></td>
      <td class="mono">${tier.min.toLocaleString()}</td>
      <td class="mono">${tier.dailyLimit.toLocaleString()}</td>
      <td class="mono accent">${tier.effectiveLimit.toLocaleString()}</td>
    </tr>
  `).join('');

  return `
    <div class="section">
      <div class="section-title">Route Limit Impact</div>
      <p class="treasury-impact-sub">Current multiplier <strong style="color:var(--accent)">${t.multiplier}x</strong> applied to route limits and metered key capacity.</p>
      <div class="treasury-table-wrap">
        <table class="treasury-table">
          <thead><tr><th>Access</th><th>MFLOW Min</th><th>Base Calls</th><th>Effective Calls</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}
