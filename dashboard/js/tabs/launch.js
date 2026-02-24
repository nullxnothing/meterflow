// ═══════════════════════════════════════════
// INFINITE Dashboard - Tab: Launch Token
// ═══════════════════════════════════════════

import { STATE } from '../state.js';
import { api, escapeHtml } from '../api.js';
import { isHolder, renderHolderGate } from '../gate.js';

let launchState = {
  step: 'form',
  loading: false,
  result: null,
  error: null,
};

export function renderLaunch() {
  if (!isHolder()) {
    return `
      <div class="page-header">
        <h1 class="page-title">Launch Token</h1>
        <p class="page-sub">Launch tokens where creator fees fund real tools, not dev wallets.</p>
      </div>
      ${renderHolderGate('Token Launcher')}
    `;
  }

  const treasury = STATE.treasury?.wallet || 'FiFGqjnBCE8t84UX9fVvRFPUadqaTLNcQZFPtsVsGwZS';

  return `
    <div class="page-header">
      <h1 class="page-title">Launch Token</h1>
      <p class="page-sub">Launch tokens where 100% of creator fees fund AI tools for every holder. No dev takes. No insider fees. Pure utility.</p>
    </div>

    <div class="launch-hero">
      <div class="launch-hero-card">
        <div class="launch-hero-badge">UTILITY-BACKED LAUNCH</div>
        <h3>How It Works</h3>
        <div class="launch-flow">
          <div class="launch-flow-step">
            <div class="launch-flow-num">1</div>
            <div class="launch-flow-text">
              <strong>You create a token</strong>
              <p>Fill out the details below. Your token launches on pump.fun.</p>
            </div>
          </div>
          <div class="launch-flow-step">
            <div class="launch-flow-num">2</div>
            <div class="launch-flow-text">
              <strong>Set Infinite as fee recipient</strong>
              <p>Creator fees route to the Infinite treasury instead of a dev wallet.</p>
            </div>
          </div>
          <div class="launch-flow-step">
            <div class="launch-flow-num">3</div>
            <div class="launch-flow-text">
              <strong>Fees fund AI tools</strong>
              <p>Every trade generates fees that pay for Claude, GPT-4o, Gemini, trading bots, and more.</p>
            </div>
          </div>
          <div class="launch-flow-step">
            <div class="launch-flow-num">4</div>
            <div class="launch-flow-text">
              <strong>Holders get free tools</strong>
              <p>Anyone holding the token gets access. More trading = more budget = better tools.</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="launch-vs">
      <div class="launch-vs-card launch-vs-old">
        <div class="launch-vs-label">Every other launchpad</div>
        <div class="launch-vs-item">Creator fees go to dev wallet</div>
        <div class="launch-vs-item">Dev dumps on holders</div>
        <div class="launch-vs-item">Token has zero utility</div>
        <div class="launch-vs-item">Community gets nothing</div>
      </div>
      <div class="launch-vs-divider">vs</div>
      <div class="launch-vs-card launch-vs-new">
        <div class="launch-vs-label">Infinite Launch</div>
        <div class="launch-vs-item">Creator fees fund AI treasury</div>
        <div class="launch-vs-item">Every holder gets free tools</div>
        <div class="launch-vs-item">Utility from block one</div>
        <div class="launch-vs-item">Self-sustaining flywheel</div>
      </div>
    </div>

    <div class="tools-section">
      <div class="section-title">Create Your Token</div>
      <div class="launch-form-card">
        ${launchState.error ? `<div class="launch-error">${escapeHtml(launchState.error)}</div>` : ''}
        ${launchState.result ? renderLaunchResult(launchState.result, treasury) : renderLaunchForm(treasury)}
      </div>
    </div>

    <div class="tools-section">
      <div class="section-title">Treasury Address</div>
      <div class="tool-config-box" style="cursor:pointer;" onclick="copyText('${treasury}')">
        ${treasury}
        <span style="color:var(--accent);font-size:10px;margin-left:8px;">CLICK TO COPY</span>
      </div>
      <p class="page-sub" style="margin-top:8px;">This is the Infinite treasury wallet. Set this as your token's fee recipient so creator fees fund AI tools instead of going to a dev wallet.</p>
    </div>
  `;
}

function renderLaunchForm(treasury) {
  return `
    <div class="launch-form" id="launchForm">
      <div class="launch-form-row">
        <div class="launch-form-group">
          <label class="launch-label">Token Name *</label>
          <input class="launch-input" id="launchName" placeholder="e.g. InfiniteAI" maxlength="32">
        </div>
        <div class="launch-form-group">
          <label class="launch-label">Ticker *</label>
          <input class="launch-input" id="launchSymbol" placeholder="e.g. INFAI" maxlength="10" style="text-transform:uppercase;">
        </div>
      </div>
      <div class="launch-form-group">
        <label class="launch-label">Description</label>
        <textarea class="launch-input launch-textarea" id="launchDesc" placeholder="What is this token about? (auto-filled if empty)" rows="3"></textarea>
      </div>
      <div class="launch-form-row">
        <div class="launch-form-group">
          <label class="launch-label">Twitter (optional)</label>
          <input class="launch-input" id="launchTwitter" placeholder="https://x.com/...">
        </div>
        <div class="launch-form-group">
          <label class="launch-label">Website (optional)</label>
          <input class="launch-input" id="launchWebsite" placeholder="https://...">
        </div>
      </div>
      <div class="launch-form-group">
        <label class="launch-label">Image URL (optional)</label>
        <input class="launch-input" id="launchImage" placeholder="https://... (PNG/JPG for token profile)">
      </div>
      <div class="launch-form-group">
        <label class="launch-label">Dev Buy (SOL)</label>
        <input class="launch-input" id="launchDevBuy" type="number" step="0.1" min="0" value="0" placeholder="0 = no dev buy">
        <div class="launch-hint">Optional initial buy in SOL. Set to 0 for a fair launch.</div>
      </div>

      <div class="launch-fee-notice">
        <strong>Fee Recipient:</strong> Infinite Treasury<br>
        <code style="font-size:11px;color:var(--text-muted);">${treasury}</code><br>
        <span style="font-size:11px;color:var(--accent);">Creator fees from this token will fund AI tools for all holders.</span>
      </div>

      <button class="launch-btn" id="launchBtn" onclick="submitLaunch()" ${launchState.loading ? 'disabled' : ''}>
        ${launchState.loading ? 'Preparing Launch...' : 'Prepare Token Launch'}
      </button>
    </div>
  `;
}

function renderLaunchResult(result, treasury) {
  return `
    <div class="launch-result">
      <div class="launch-result-badge">READY TO LAUNCH</div>
      <h3>${escapeHtml(result.tokenMetadata.name)} ($${escapeHtml(result.tokenMetadata.symbol)})</h3>
      <p style="color:var(--text-muted);font-size:12px;margin-bottom:16px;">${escapeHtml(result.description)}</p>

      <div class="launch-result-info">
        <div class="launch-result-row">
          <span>Metadata URI</span>
          <code onclick="copyText('${result.metadataUri}')" style="cursor:pointer;">${result.metadataUri.slice(0, 40)}... <span style="color:var(--accent);font-size:9px;">COPY</span></code>
        </div>
        <div class="launch-result-row">
          <span>Fee Recipient</span>
          <code onclick="copyText('${treasury}')" style="cursor:pointer;">${treasury.slice(0, 12)}...${treasury.slice(-6)} <span style="color:var(--accent);font-size:9px;">COPY</span></code>
        </div>
        <div class="launch-result-row">
          <span>Platform</span>
          <code>pump.fun</code>
        </div>
      </div>

      <div class="launch-next-steps">
        <div class="section-title" style="margin-bottom:12px;">Next Steps</div>
        <div class="tool-config-box">1. Go to pump.fun/create\n2. Use the metadata URI above\n3. Set fee recipient to the Infinite treasury address\n4. Launch your token\n\nCreator fees will automatically fund AI tools for all holders.</div>
      </div>

      <button class="launch-btn" style="margin-top:16px;background:var(--surface);color:var(--text);border:1px solid var(--border);" onclick="resetLaunch()">Launch Another Token</button>
    </div>
  `;
}

// Global functions for onclick handlers
window.submitLaunch = async function () {
  const name = document.getElementById('launchName')?.value.trim();
  const symbol = document.getElementById('launchSymbol')?.value.trim().toUpperCase();
  const description = document.getElementById('launchDesc')?.value.trim();
  const twitter = document.getElementById('launchTwitter')?.value.trim();
  const website = document.getElementById('launchWebsite')?.value.trim();
  const imageUrl = document.getElementById('launchImage')?.value.trim();
  const devBuySol = parseFloat(document.getElementById('launchDevBuy')?.value) || 0;

  if (!name || !symbol) {
    launchState.error = 'Token name and ticker are required.';
    rerenderLaunchForm();
    return;
  }

  launchState.loading = true;
  launchState.error = null;
  rerenderLaunchForm();

  try {
    const result = await api('/v1/launch/create', {
      method: 'POST',
      body: JSON.stringify({ name, symbol, description, twitter, website, imageUrl, devBuySol }),
    });
    launchState.result = result;
    launchState.loading = false;
    rerenderLaunchForm();
  } catch (err) {
    launchState.error = err.message || 'Launch preparation failed.';
    launchState.loading = false;
    rerenderLaunchForm();
  }
};

window.resetLaunch = function () {
  launchState = { step: 'form', loading: false, result: null, error: null };
  rerenderLaunchForm();
};

function rerenderLaunchForm() {
  const main = document.querySelector('.main');
  if (main && STATE.activeTab === 'launch') {
    main.innerHTML = renderLaunch();
  }
}
