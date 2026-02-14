// ═══════════════════════════════════════════
// INFINITE Dashboard - Tab: Video Lab
// ═══════════════════════════════════════════

import { STATE, VIDEOS } from '../state.js';
import { api, API_BASE, escapeHtml } from '../api.js';
import { saveVideoHistory } from '../session.js';
import { showToast } from '../actions.js';

function isVideoTierAllowed() {
  const t = (STATE.tier || '').toLowerCase();
  return t === 'operator' || t === 'architect';
}

export function renderVideo() {
  if (!STATE.providers.gemini) {
    return `
      <div class="page-header">
        <h1 class="page-title">Video Lab</h1>
        <p class="page-sub">Generate AI videos with Google Veo 2</p>
      </div>
      <div class="video-tier-gate">
        <h3>Coming Soon</h3>
        <p>Video generation will activate after token launch. Powered by Google Veo 2.</p>
        <p style="color:var(--text-muted);font-family:var(--font-mono);font-size:11px;margin-top:16px;">This feature requires the Gemini API to be configured by the protocol treasury.</p>
      </div>
    `;
  }

  if (!isVideoTierAllowed()) {
    return `
      <div class="page-header">
        <h1 class="page-title">Video Lab</h1>
        <p class="page-sub">Generate AI videos with Google Veo 2</p>
      </div>
      <div class="video-tier-gate">
        <h3>Operator Tier Required</h3>
        <p>Video generation requires Operator tier (100K+ $INFINITE) or above.</p>
        <p style="color:var(--text-muted);font-family:var(--font-mono);font-size:11px;margin-top:16px;">Current: ${STATE.tier || '—'} (${STATE.balance.toLocaleString()} $INFINITE)</p>
      </div>
    `;
  }

  return `
    <div class="page-header">
      <h1 class="page-title">Video Lab</h1>
      <p class="page-sub">Generate AI videos with Google Veo 2. Each generation counts as 10 API calls.</p>
    </div>
    <div class="video-controls">
      <input type="text" class="image-prompt-input" id="videoPrompt" placeholder="A drone shot flying over a futuristic city at night..."
        onkeydown="if(event.key==='Enter')generateVideo()">
      <select class="video-select" id="videoAspect">
        <option value="16:9">16:9</option>
        <option value="9:16">9:16</option>
        <option value="1:1">1:1</option>
      </select>
      <select class="video-select" id="videoDuration">
        <option value="5">5s</option>
        <option value="10">10s</option>
      </select>
      <button class="image-gen-btn" id="videoGenBtn" onclick="generateVideo()" ${VIDEOS.isGenerating ? 'disabled' : ''}>
        ${VIDEOS.isGenerating ? 'GENERATING...' : 'CREATE'}
      </button>
    </div>
    <div class="section">
      <div class="section-title">Generated Videos</div>
      <div class="image-gallery" id="videoGallery">
        ${renderVideoGallery()}
      </div>
    </div>
  `;
}

export function renderVideoGallery() {
  if (VIDEOS.gallery.length === 0 && !VIDEOS.isGenerating) {
    return '<div style="color:var(--text-muted);font-family:var(--font-mono);font-size:12px;padding:60px;text-align:center;">No videos yet. Describe what you want to create.</div>';
  }

  return VIDEOS.gallery.map((v, i) => {
    if (v.status === 'pending') {
      return `
        <div class="video-pending">
          <div class="image-spinner"></div>
          <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">Generating video...</span>
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);">Estimated: 1-3 minutes</span>
          <div class="video-card-prompt" style="white-space:normal;text-align:center;padding:0 16px;">${escapeHtml(v.prompt)}</div>
        </div>
      `;
    }
    if (v.status === 'failed') {
      return `
        <div class="video-card" style="border-color:var(--red);">
          <div style="padding:40px;text-align:center;color:var(--red);font-family:var(--font-mono);font-size:12px;">
            Generation failed${v.error ? ': ' + escapeHtml(v.error) : ''}
          </div>
          <div class="video-card-footer">
            <div class="video-card-prompt">${escapeHtml(v.prompt)}</div>
          </div>
        </div>
      `;
    }
    if (!v.uri) {
      return `
        <div class="video-card" style="border-color:var(--red);">
          <div style="padding:40px;text-align:center;color:var(--red);font-family:var(--font-mono);font-size:12px;">No video data returned</div>
          <div class="video-card-footer"><div class="video-card-prompt">${escapeHtml(v.prompt)}</div></div>
        </div>`;
    }
    return `
      <div class="video-card">
        <video controls preload="metadata" src="${v.uri}"></video>
        <div class="video-card-footer">
          <div class="video-card-prompt">${escapeHtml(v.prompt)}</div>
          <button class="btn-sm" onclick="downloadVideo('${v.uri}')">Save</button>
        </div>
      </div>
    `;
  }).join('');
}

export async function generateVideo() {
  const input = document.getElementById('videoPrompt');
  if (!input) return;
  const prompt = input.value.trim();
  if (!prompt || VIDEOS.isGenerating) return;

  const aspectRatio = document.getElementById('videoAspect')?.value || '16:9';
  const duration = parseInt(document.getElementById('videoDuration')?.value || '5');

  VIDEOS.isGenerating = true;
  const entry = { prompt, status: 'pending', operationName: null, uri: null, error: null, createdAt: Date.now() };
  VIDEOS.gallery.unshift(entry);
  input.value = '';
  renderVideoState();

  try {
    const data = await api('/v1/video/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt, aspectRatio, duration }),
    });
    entry.operationName = data.operationName;
    startVideoPolling(entry);
    saveVideoHistory();
  } catch (err) {
    entry.status = 'failed';
    entry.error = err.message || 'Generation failed';
    VIDEOS.isGenerating = false;
    renderVideoState();
    showToast(err.message || 'Video generation failed', true);
  }
}

function startVideoPolling(entry) {
  if (!entry.operationName) return;

  let failures = 0;
  const MAX_FAILURES = 36; // 3 minutes at 5s intervals

  const intervalId = setInterval(async () => {
    try {
      const data = await api(`/v1/video/status/${entry.operationName}`);
      failures = 0;

      if (data.status === 'complete') {
        entry.status = 'complete';
        entry.uri = data.video?.uri ? `${API_BASE}${data.video.uri}` : null;
        clearInterval(intervalId);
        VIDEOS.pollIntervals.delete(entry.operationName);
        VIDEOS.isGenerating = false;
        saveVideoHistory();
        renderVideoState();
      } else if (data.status === 'failed') {
        entry.status = 'failed';
        entry.error = data.error || 'Unknown error';
        clearInterval(intervalId);
        VIDEOS.pollIntervals.delete(entry.operationName);
        VIDEOS.isGenerating = false;
        saveVideoHistory();
        renderVideoState();
      }
    } catch (err) {
      failures++;
      console.error('Video poll error:', err.message, `(${failures}/${MAX_FAILURES})`);
      if (failures >= MAX_FAILURES) {
        entry.status = 'failed';
        entry.error = 'Timed out waiting for video';
        clearInterval(intervalId);
        VIDEOS.pollIntervals.delete(entry.operationName);
        VIDEOS.isGenerating = false;
        renderVideoState();
      }
    }
  }, 5000);

  VIDEOS.pollIntervals.set(entry.operationName, intervalId);
}

export function renderVideoState() {
  const gallery = document.getElementById('videoGallery');
  const btn = document.getElementById('videoGenBtn');
  if (btn) {
    btn.disabled = VIDEOS.isGenerating;
    btn.textContent = VIDEOS.isGenerating ? 'GENERATING...' : 'CREATE';
  }
  if (gallery) gallery.innerHTML = renderVideoGallery();
}

export function downloadVideo(uri) {
  const link = document.createElement('a');
  link.href = uri;
  link.download = `infinite-video-${Date.now()}.mp4`;
  link.click();
}

// Attach to window for onclick handlers
window.generateVideo = generateVideo;
window.downloadVideo = downloadVideo;
