// ═══════════════════════════════════════════
// Meterflow Dashboard - Tab: Agent Checkout
// ═══════════════════════════════════════════

import { STATE, VOTES, API_BASE } from '../state.js';
import { escapeHtml } from '../utils.js';

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DEFAULT_WALLET = 'So11111111111111111111111111111111111111112';

const NEXT_AGENTS = [
  { id: 'helius', label: 'Wallet Investigator', desc: 'Trace activity, assets, and behavior from real wallet data.' },
  { id: 'jupiter', label: 'Swap Safety Agent', desc: 'Quote routes and flag bad execution before a trade.' },
  { id: 'dexscreener', label: 'Token DD Agent', desc: 'Check liquidity, age, market data, and risk signals.' },
  { id: 'twitter', label: 'Narrative Scout', desc: 'Watch social momentum and connect it to on-chain behavior.' },
];

export const holderToolsState = {
  wallet: '',
  loading: false,
  error: '',
  result: null,
  localVotes: new Set(JSON.parse(sessionStorage.getItem('meterflow_agent_votes') || '[]')),
};

function currentVotes() {
  return STATE.apiKeyFull ? VOTES.userVotes : holderToolsState.localVotes;
}

function formatUsd(value) {
  const n = Number(value || 0);
  return `$${n.toFixed(3).replace(/0$/, '').replace(/0$/, '')}`;
}

function short(value = '') {
  return value ? `${value.slice(0, 4)}...${value.slice(-4)}` : '--';
}

function riskClass(value = '') {
  if (value === 'strong') return 'low';
  if (value === 'mixed') return 'medium';
  return 'high';
}

function renderHero() {
  const checkout = holderToolsState.result?.checkout;
  return `
    <div class="holder-command-panel agent-checkout-hero">
      <div class="holder-command-copy">
        <div class="holder-eyebrow">Agent Checkout</div>
        <h2>Watch an AI agent buy wallet intelligence.</h2>
        <p>Enter a Solana wallet. The agent gets a small USDC budget, purchases Helius-backed data calls through Meterflow-style checkout, and returns receipts plus a readable investigation.</p>
        <div class="agent-wallet-row">
          <input id="agentWalletInput" class="holder-token-input" value="${escapeHtml(holderToolsState.wallet)}" placeholder="Paste wallet address">
          <button class="btn-primary holder-scan-btn" onclick="runWalletDeepDive()" ${holderToolsState.loading ? 'disabled' : ''}>
            ${holderToolsState.loading ? 'Investigating...' : 'Run Deep Dive'}
          </button>
          <button class="btn-secondary holder-scan-btn" onclick="loadDemoWallet()">Use Demo Wallet</button>
        </div>
        ${holderToolsState.error ? `<div class="holder-error">${escapeHtml(holderToolsState.error)}</div>` : ''}
      </div>
      <div class="holder-tier-card agent-budget-card">
        <div class="holder-tier-label">Agent Budget</div>
        <div class="holder-tier-name tier-signal">${formatUsd(checkout?.budgetUsd ?? 0.05)}</div>
        <div class="holder-tier-balance">${checkout ? `${formatUsd(checkout.spentUsd)} spent · ${formatUsd(checkout.remainingUsd)} left` : 'ready to spend on data'}</div>
        <div class="holder-progress-track">
          <div class="holder-progress-fill" style="width:${checkout ? Math.min(100, (checkout.spentUsd / checkout.budgetUsd) * 100) : 0}%"></div>
        </div>
        <div class="holder-tier-next">USDC checkout · receipt per call</div>
      </div>
    </div>
  `;
}

function renderCheckoutSteps() {
  const steps = holderToolsState.result?.steps || [
    { id: 'wallet_balance', label: 'Check SOL balance', route: 'Helius RPC getBalance', priceUsd: 0.003, status: 'queued' },
    { id: 'asset_inventory', label: 'Inventory tokens and NFTs', route: 'Helius DAS getAssetsByOwner', priceUsd: 0.008, status: 'queued' },
    { id: 'recent_activity', label: 'Read recent transaction history', route: 'Helius RPC getSignaturesForAddress', priceUsd: 0.006, status: 'queued' },
    { id: 'behavior_parse', label: 'Classify wallet behavior', route: 'Helius Enhanced Transactions', priceUsd: 0.012, status: 'queued' },
  ];

  return `
    <section class="holder-tool-main agent-checkout-steps">
      <div class="holder-section-head">
        <div>
          <div class="holder-eyebrow">Checkout Log</div>
          <h3>Paid calls the agent buys</h3>
        </div>
        <span class="holder-live-badge">${holderToolsState.result ? 'Receipts' : 'Ready'}</span>
      </div>
      <div class="agent-step-list">
        ${steps.map((step, index) => `
          <div class="agent-paid-step ${step.status || 'queued'}">
            <div class="agent-step-index">${String(index + 1).padStart(2, '0')}</div>
            <div class="agent-step-body">
              <strong>${escapeHtml(step.label)}</strong>
              <span>${escapeHtml(step.route)}</span>
              ${step.error ? `<em>${escapeHtml(step.error)}</em>` : ''}
            </div>
            <div class="agent-step-price">${formatUsd(step.priceUsd)}</div>
            <div class="agent-step-receipt">
              ${step.receipt ? `
                <span>${escapeHtml(step.receipt.id)}</span>
                <small>${step.receipt.latencyMs}ms · tx ${escapeHtml(step.receipt.txSignature)}</small>
              ` : '<span>waiting</span><small>receipt after call</small>'}
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function renderReport() {
  const report = holderToolsState.result?.report;
  if (!report) {
    return `
      <aside class="holder-missions agent-report-empty">
        <div class="holder-section-head compact">
          <div>
            <div class="holder-eyebrow">Report</div>
            <h3>Wallet intelligence output</h3>
          </div>
        </div>
        <div class="holder-empty-tool">
          <div class="holder-empty-title">Run a deep dive to generate a report.</div>
          <div class="holder-empty-sub">This is the holder-friendly version of Meterflow: not API docs, a visible agent buying data and returning receipts.</div>
        </div>
      </aside>
    `;
  }

  const { portfolio, activity, verdict } = report;
  return `
    <aside class="holder-missions agent-report">
      <div class="holder-section-head compact">
        <div>
          <div class="holder-eyebrow">Final Report</div>
          <h3>${escapeHtml(verdict.persona)}</h3>
        </div>
      </div>
      <div class="holder-result-score risk-${riskClass(verdict.risk)} agent-score">
        <span>${Number(verdict.score || 0)}</span>
        <strong>${escapeHtml(verdict.risk).toUpperCase()}</strong>
      </div>
      <div class="agent-report-headline">${escapeHtml(verdict.headline)}</div>
      <div class="agent-report-stats">
        <div><span>SOL</span><strong>${portfolio.nativeSol === null ? '--' : Number(portfolio.nativeSol).toFixed(3)}</strong></div>
        <div><span>Tokens</span><strong>${portfolio.fungibleCount}</strong></div>
        <div><span>NFTs</span><strong>${portfolio.nftCount}</strong></div>
        <div><span>Tx Sample</span><strong>${activity.sampledTransactions}</strong></div>
      </div>
      <div class="agent-findings">
        ${(verdict.findings || []).map(item => `<div class="holder-mission done"><span class="holder-mission-check">✓</span><div><strong>${escapeHtml(item)}</strong></div></div>`).join('')}
      </div>
      <div class="holder-empty-sub">${escapeHtml(verdict.nextAction)}</div>
      <a class="holder-result-link" href="${escapeHtml(report.explorer)}" target="_blank" rel="noopener">Open wallet on Orb</a>
    </aside>
  `;
}

function renderVoteSection() {
  return `
    <section class="holder-vote-section">
      <div class="holder-section-head">
        <div>
          <div class="holder-eyebrow">Holder Vote</div>
          <h3>Which agent should ship next?</h3>
        </div>
        <div class="holder-vote-hint">${STATE.apiKeyFull ? 'Wallet vote' : 'Local preview vote'}</div>
      </div>
      <div class="holder-vote-grid">
        ${NEXT_AGENTS.map(agent => {
          const voted = currentVotes().has(agent.id);
          const count = Number(VOTES.voteCounts?.[agent.id] || 0);
          return `
            <button class="holder-vote-card ${voted ? 'voted' : ''}" onclick="holderVote('${agent.id}')">
              <span class="holder-vote-count">${count}</span>
              <strong>${escapeHtml(agent.label)}</strong>
              <p>${escapeHtml(agent.desc)}</p>
              <em>${voted ? 'Voted' : 'Vote'}</em>
            </button>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function renderPublicNotice() {
  return `
    <div class="holder-lock-notice">
      <div>
        <strong>No wallet required.</strong>
        <span>This demo uses real server-side Helius reads and simulated Meterflow receipts. Connect a wallet later to attach votes and rewards to your MFLOW profile.</span>
      </div>
      <button class="btn-secondary" onclick="openWalletConnect()">Connect Wallet</button>
    </div>
  `;
}

export function renderHolderTools() {
  const report = holderToolsState.result?.report;
  return `
    <div class="page-header holder-page-header">
      <h1 class="page-title">Agent Checkout</h1>
      <p class="page-sub">A public wallet deep-dive demo: watch an agent buy the data it needs and return receipts for every call.</p>
    </div>
    ${renderPublicNotice()}
    ${renderHero()}
    <div class="stats-row">
      <div class="stat-card"><div class="label">Data Source</div><div class="value accent">Helius</div><div class="sub">server-side wallet reads</div></div>
      <div class="stat-card"><div class="label">Calls</div><div class="value">4</div><div class="sub">priced agent steps</div></div>
      <div class="stat-card"><div class="label">Receipts</div><div class="value green">${holderToolsState.result ? holderToolsState.result.steps.length : 0}</div><div class="sub">created in checkout</div></div>
      <div class="stat-card"><div class="label">Wallet</div><div class="value">${report ? short(report.wallet) : '--'}</div><div class="sub">investigation target</div></div>
    </div>
    <div class="holder-tool-grid agent-checkout-grid">
      ${renderCheckoutSteps()}
      ${renderReport()}
    </div>
    ${renderVoteSection()}
  `;
}

export function loadDemoWallet() {
  holderToolsState.wallet = DEFAULT_WALLET;
  import('../render.js').then(m => m.render());
}

export async function runWalletDeepDive() {
  const input = document.getElementById('agentWalletInput');
  const wallet = String(input?.value || holderToolsState.wallet || '').trim();
  holderToolsState.wallet = wallet;
  holderToolsState.error = '';

  if (!SOLANA_ADDRESS_RE.test(wallet)) {
    holderToolsState.error = 'Enter a valid Solana wallet address.';
    import('../render.js').then(m => m.render());
    return;
  }

  holderToolsState.loading = true;
  await import('../render.js').then(m => m.render());

  try {
    const res = await fetch(`${API_BASE}/holder/wallet-deep-dive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: wallet }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || 'Wallet deep dive failed.');
    holderToolsState.result = data;
    window.showToast?.('Wallet deep dive complete');
  } catch (err) {
    holderToolsState.error = err.message || 'Wallet deep dive failed.';
    window.showToast?.(holderToolsState.error, true);
  } finally {
    holderToolsState.loading = false;
    import('../render.js').then(m => m.render());
  }
}

export function holderVote(agentId) {
  if (STATE.apiKeyFull && window.toggleVote) {
    window.toggleVote(agentId);
    return;
  }
  if (holderToolsState.localVotes.has(agentId)) {
    holderToolsState.localVotes.delete(agentId);
  } else {
    holderToolsState.localVotes.add(agentId);
  }
  sessionStorage.setItem('meterflow_agent_votes', JSON.stringify([...holderToolsState.localVotes]));
  window.showToast?.('Vote saved locally. Connect wallet to attach it to your holder profile.');
  import('../render.js').then(m => m.render());
}

window.loadDemoWallet = loadDemoWallet;
window.runWalletDeepDive = runWalletDeepDive;
window.holderVote = holderVote;
