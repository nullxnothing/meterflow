// ═══════════════════════════════════════════
// INFINITE Dashboard - Tab: X Tools
// ═══════════════════════════════════════════

import { STATE } from '../state.js';
import { isHolder, renderHolderGate } from '../gate.js';

export function renderXTools() {
  if (!isHolder()) {
    return `
      <div class="page-header">
        <h1 class="page-title">X Tools</h1>
        <p class="page-sub">Free CT intelligence tools for Twitter/X — profile scanning, alpha discovery, and trending project detection.</p>
      </div>
      ${renderHolderGate('X Tools')}
    `;
  }

  const key = STATE.apiKeyFull || 'inf_your_key_here';

  return `
    <div class="page-header">
      <h1 class="page-title">X Tools</h1>
      <p class="page-sub">Free CT intelligence on Twitter/X. Scan profiles, track key followers, detect contract addresses, and discover trending projects — all powered by your Infinite API key.</p>
    </div>

    <div class="tools-section">
      <div class="section-title">Infinite Alpha (Beta) — Chrome Extension</div>
      <div class="x-tools-hero">
        <div class="x-tools-card">
          <div class="x-tools-badge">FREE / BETA</div>
          <h3>What You Get</h3>
          <div class="x-tools-features">
            <div class="x-tools-feature">
              <span class="x-feat-icon">[S]</span>
              <div>
                <strong>Profile Intelligence</strong>
                <p>See rename history, key followers, and contract addresses directly on any Twitter profile.</p>
              </div>
            </div>
            <div class="x-tools-feature">
              <span class="x-feat-icon">[D]</span>
              <div>
                <strong>Discover Feed</strong>
                <p>Real-time feed of new crypto projects detected when key profiles (VCs, alpha callers, devs) follow them.</p>
              </div>
            </div>
            <div class="x-tools-feature">
              <span class="x-feat-icon">[T]</span>
              <div>
                <strong>Trending Projects</strong>
                <p>Projects ranked by how many key CT profiles are following them. Updated every 10 minutes.</p>
              </div>
            </div>
            <div class="x-tools-feature">
              <span class="x-feat-icon">[C]</span>
              <div>
                <strong>CA Detection</strong>
                <p>Automatic Solana contract address detection in tweets from monitored accounts.</p>
              </div>
            </div>
            <div class="x-tools-feature">
              <span class="x-feat-icon">[!]</span>
              <div>
                <strong>Rename & Bio Alerts</strong>
                <p>Get alerted when projects change their username or bio — a common rug signal.</p>
              </div>
            </div>
            <div class="x-tools-feature">
              <span class="x-feat-icon">[N]</span>
              <div>
                <strong>Private Notes</strong>
                <p>Add private notes to any Twitter profile. Only you can see them.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="tools-section">
      <div class="section-title">Setup Guide</div>
      <div class="x-tools-steps">
        <div class="x-step">
          <div class="x-step-num">1</div>
          <div class="x-step-content">
            <h4>Install the Extension</h4>
            <p>Download Infinite Alpha and load it into Chrome as an unpacked extension.</p>
            <a href="https://github.com/infinitekeys/infinite-alpha/releases/latest/download/infinite-alpha.zip" target="_blank" rel="noopener" class="x-download-btn">&#x2B07; Download Extension (.zip)</a>
            <div class="tool-config-box" style="margin-top:12px;">1. Unzip the downloaded file\n2. Open chrome://extensions\n3. Enable "Developer mode" (top right)\n4. Click "Load unpacked"\n5. Select the unzipped folder</div>
          </div>
        </div>
        <div class="x-step">
          <div class="x-step-num">2</div>
          <div class="x-step-content">
            <h4>Enter Your API Key</h4>
            <p>Click the Infinite Alpha icon in your browser toolbar and paste the key below:</p>
            <div class="x-key-display">
              <div class="x-key-display-label">Your API Key</div>
              <div class="x-key-display-row">
                <code class="x-key-display-value" id="xToolsKey">${key}</code>
                <button class="x-key-copy-btn" onclick="copyText('${key}')">Copy Key</button>
              </div>
            </div>
          </div>
        </div>
        <div class="x-step">
          <div class="x-step-num">3</div>
          <div class="x-step-content">
            <h4>Browse Twitter</h4>
            <p>Navigate to any Twitter/X profile. The Infinite Alpha panel will appear below the bio with:</p>
            <ul class="x-checklist">
              <li>Rename history badges</li>
              <li>Key follower pills with categories (VC, alpha, dev, etc.)</li>
              <li>Detected contract addresses (click to copy)</li>
              <li>Private notes input</li>
            </ul>
          </div>
        </div>
        <div class="x-step">
          <div class="x-step-num">4</div>
          <div class="x-step-content">
            <h4>Open the Side Panel</h4>
            <p>Click the extension icon and hit "Open Side Panel" for the full feed experience:</p>
            <ul class="x-checklist">
              <li><strong>Discover</strong> — New projects detected by key profile follows</li>
              <li><strong>Trending</strong> — Projects ranked by key follower velocity</li>
              <li><strong>Alerts</strong> — Username changes, bio edits, and CA detections</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <div class="tools-section">
      <div class="section-title">API Endpoints</div>
      <p class="page-sub" style="margin-bottom:16px;">You can also hit the Alpha API directly from your own tools.</p>
      <div class="x-api-grid">
        ${[
          { method: 'GET', path: '/v1/alpha/profile/:username', desc: 'Scan a Twitter profile' },
          { method: 'GET', path: '/v1/alpha/profile/:id/parents', desc: 'Key followers of a project' },
          { method: 'GET', path: '/v1/alpha/profile/:id/children', desc: 'What a key profile follows' },
          { method: 'GET', path: '/v1/alpha/discover', desc: 'Discover feed (new projects)' },
          { method: 'GET', path: '/v1/alpha/trending', desc: 'Trending projects' },
          { method: 'GET', path: '/v1/alpha/alerts/:id', desc: 'Alerts for a profile' },
          { method: 'GET', path: '/v1/alpha/ca/:id', desc: 'Detected contract addresses' },
          { method: 'GET', path: '/v1/alpha/scan-token/:address', desc: 'Scan a Solana token (DexScreener)' },
          { method: 'GET', path: '/v1/alpha/notes/:id', desc: 'Get your note for a profile' },
          { method: 'PUT', path: '/v1/alpha/notes/:id', desc: 'Save a note' },
        ].map(ep => `
          <div class="x-api-row">
            <span class="x-api-method">${ep.method}</span>
            <code class="x-api-path">${ep.path}</code>
            <span class="x-api-desc">${ep.desc}</span>
          </div>
        `).join('')}
      </div>
      <div class="tool-config-box" style="margin-top:12px;">curl -H "Authorization: Bearer ${key}" \\\n  https://api.infinite.sh/v1/alpha/discover</div>
    </div>
  `;
}
