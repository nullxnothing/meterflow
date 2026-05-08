// ═══════════════════════════════════════════
// Meterflow Dashboard - Tab: Video Route
// ═══════════════════════════════════════════

import { STATE, VIDEOS, API_BASE } from '../state.js';
import { api } from '../api.js';
import { escapeHtml } from '../utils.js';

function videoSrc(uri) {
  if (!uri) return '';
  const sep = uri.includes('?') ? '&' : '?';
  return `${uri}${sep}token=${encodeURIComponent(STATE.apiKeyFull || '')}`;
}
import { saveVideoHistory } from '../session.js';
import { showToast } from '../actions.js';
import { isHolder, renderHolderGate } from '../gate.js';

const VIDEO_CHIPS = [
  'Drone shot over a futuristic city at night',
  'Ocean waves crashing in slow motion',
  'Time-lapse of a flower blooming',
  'Walking through a neon-lit market',
  'Cinematic sunrise over mountain range',
  'Abstract liquid metal morphing shapes',
];

const FILM_SVG = `<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
  <line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/>
  <line x1="2" y1="12" x2="22" y2="12"/>
  <line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/>
  <line x1="17" y1="7" x2="22" y2="7"/><line x1="17" y1="17" x2="22" y2="17"/>
</svg>`;

function isVideoTierAllowed() {
  const t = (STATE.tier || '').toLowerCase();
  return t === 'operator' || t === 'architect' || t === 'alpha';
}

export function renderVideo() {
  if (!isHolder()) {
    return `
      <div class="page-header">
        <h1 class="page-title">Video Route</h1>
        <p class="page-sub">Generate AI videos with Google Veo 2</p>
      </div>
      ${renderHolderGate('Video Route')}
    `;
  }

  if (!STATE.providers.gemini) {
    return `
      <div class="page-header">
        <h1 class="page-title">Video Route</h1>
        <p class="page-sub">Generate AI videos with Google Veo 2</p>
      </div>
      <div class="media-lab-gate">
        <h3>Provider Key Required</h3>
        <p>Video generation is ready when a Gemini/Veo provider key is configured for this route.</p>
        <p class="media-lab-gate-hint">This route requires a video provider integration and settlement wallet policy.</p>
      </div>
    `;
  }

  if (!isVideoTierAllowed()) {
    return `
      <div class="page-header">
        <h1 class="page-title">Video Route</h1>
        <p class="page-sub">Generate AI videos with Google Veo 2</p>
      </div>
      <div class="media-lab-gate">
        <h3>Operator Tier Required</h3>
        <p>Video generation requires Operator tier or an approved budget policy because it is a high-cost metered route.</p>
        <p class="media-lab-gate-hint">Current: ${STATE.tier || '—'} (${(STATE.balance ?? 0).toLocaleString()} MFLOW)</p>
      </div>
    `;
  }

  const currentAspect = VIDEOS._selectedAspect || '16:9';
  const currentDuration = VIDEOS._selectedDuration || '5';

  return `
    <div class="page-header">
      <h1 class="page-title">Video Route</h1>
      <p class="page-sub">Generate AI videos with Google Veo 2. Each generation counts as 10 API calls.</p>
    </div>

    <div class="media-lab-composer">
      <textarea class="media-lab-textarea" id="videoPrompt" rows="3"
        placeholder="Describe the video — a drone shot, slow-motion sequence, cinematic scene..."
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();generateVideo()}"></textarea>
      <div class="media-lab-action-bar">
        <div class="media-lab-segment" id="videoAspectGroup">
          <button class="media-lab-segment-btn ${currentAspect === '16:9' ? 'active' : ''}" data-value="16:9" onclick="setVideoAspect('16:9')">
            <span class="media-lab-segment-icon media-lab-segment-icon--16x9"></span> 16:9
          </button>
          <button class="media-lab-segment-btn ${currentAspect === '9:16' ? 'active' : ''}" data-value="9:16" onclick="setVideoAspect('9:16')">
            <span class="media-lab-segment-icon media-lab-segment-icon--9x16"></span> 9:16
          </button>
          <button class="media-lab-segment-btn ${currentAspect === '1:1' ? 'active' : ''}" data-value="1:1" onclick="setVideoAspect('1:1')">
            <span class="media-lab-segment-icon media-lab-segment-icon--1x1"></span> 1:1
          </button>
        </div>
        <div class="media-lab-segment" id="videoDurationGroup">
          <button class="media-lab-segment-btn ${currentDuration === '5' ? 'active' : ''}" data-value="5" onclick="setVideoDuration('5')">5s</button>
          <button class="media-lab-segment-btn ${currentDuration === '10' ? 'active' : ''}" data-value="10" onclick="setVideoDuration('10')">10s</button>
        </div>
        <span class="media-lab-badge">10 API CALLS / VIDEO</span>
        <button class="media-lab-gen-btn" id="videoGenBtn" onclick="generateVideo()" ${VIDEOS.isGenerating ? 'disabled' : ''}>
          ${VIDEOS.isGenerating ? 'GENERATING...' : 'CREATE'}
        </button>
      </div>
    </div>

    <div class="media-lab-chips">
      ${VIDEO_CHIPS.map(c => `<button class="media-lab-chip" onclick="fillVideoPrompt('${escapeHtml(c)}')">${escapeHtml(c)}</button>`).join('')}
    </div>

    <div class="section">
      <div class="section-title">Generated Videos</div>
      <div class="media-lab-gallery" id="videoGallery">
        ${renderVideoGallery()}
      </div>
    </div>

    <div id="mediaLabLightbox"></div>
  `;
}

export function renderVideoGallery() {
  if (VIDEOS.gallery.length === 0 && !VIDEOS.isGenerating) {
    return `
      <div class="media-lab-empty">
        <div class="media-lab-empty-icon">${FILM_SVG}</div>
        <h3>No videos yet</h3>
        <p>Describe a scene and we'll generate a short video clip — cinematic shots, slow motion, time-lapses, and more.</p>
        <button class="media-lab-empty-btn" onclick="fillVideoPrompt('A drone shot flying over a futuristic city at night with neon lights')">Try an example</button>
      </div>
    `;
  }

  return VIDEOS.gallery.map((v, i) => {
    if (v.status === 'pending') {
      const elapsed = v.createdAt ? Math.floor((Date.now() - v.createdAt) / 1000) : 0;
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      return `
        <div class="media-lab-progress-card">
          <div class="media-lab-progress-dot"></div>
          <div class="media-lab-progress-label">Generating video...</div>
          <div class="media-lab-progress-time">Elapsed: ${timeStr} — est. 1-3 min</div>
          <div class="media-lab-progress-prompt">${escapeHtml(v.prompt)}</div>
        </div>
      `;
    }

    if (v.status === 'failed') {
      return `
        <div class="media-lab-card">
          <div class="media-lab-status-badge media-lab-status-badge--failed">FAILED</div>
          <div class="media-lab-progress-card media-lab-card-fail-inner">
            <div class="media-lab-fail-msg">
              ${v.error ? escapeHtml(v.error) : 'Generation failed'}
            </div>
            <div class="media-lab-progress-prompt">${escapeHtml(v.prompt)}</div>
          </div>
        </div>
      `;
    }

    if (!v.uri) {
      return `
        <div class="media-lab-card">
          <div class="media-lab-status-badge media-lab-status-badge--failed">ERROR</div>
          <div class="media-lab-progress-card media-lab-card-fail-inner">
            <div class="media-lab-fail-msg">No video data returned</div>
            <div class="media-lab-progress-prompt">${escapeHtml(v.prompt)}</div>
          </div>
        </div>
      `;
    }

    const safePrompt = escapeHtml(v.prompt);
    return `
      <div class="media-lab-card">
        <div class="media-lab-card-video-wrap">
          <video controls preload="metadata" src="${videoSrc(v.uri)}" onclick="event.stopPropagation();openVideoLightbox(${i})"></video>
        </div>
        <div class="media-lab-card-overlay">
          <div class="media-lab-card-overlay-prompt">${safePrompt}</div>
          <div class="media-lab-card-actions">
            <button class="media-lab-card-action" onclick="event.stopPropagation();downloadVideo('${v.uri}')">Save</button>
            <button class="media-lab-card-action" onclick="event.stopPropagation();copyVideoPrompt(${i})">Copy Prompt</button>
            <button class="media-lab-card-action" onclick="event.stopPropagation();openVideoLightbox(${i})">Expand</button>
            <button class="media-lab-card-action media-lab-card-action--delete" onclick="event.stopPropagation();deleteVideo(${i})">Delete</button>
          </div>
        </div>
      </div>
    `;
  function deleteVideo(idx) {
    VIDEOS.gallery.splice(idx, 1);
    saveVideoHistory();
    renderVideoState();
    if (showToast) showToast('Video deleted');
  }
  window.deleteVideo = deleteVideo;
  }).join('');
}

export async function generateVideo() {
  const input = document.getElementById('videoPrompt');
  if (!input) return;
  const prompt = input.value.trim();
  if (!prompt || VIDEOS.isGenerating) return;

  const aspectRatio = VIDEOS._selectedAspect || '16:9';
  const duration = parseInt(VIDEOS._selectedDuration || '5');

  VIDEOS.isGenerating = true;
  const entry = { prompt, status: 'pending', operationName: null, uri: null, error: null, createdAt: Date.now() };
  VIDEOS.gallery.unshift(entry);
  input.value = '';
  renderVideoState();

  // Start elapsed timer
  startElapsedTimer();

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
    stopElapsedTimer();
    renderVideoState();
    showToast(err.message || 'Video generation failed', true);
  }
}

let _elapsedTimerId = null;

function startElapsedTimer() {
  stopElapsedTimer();
  _elapsedTimerId = setInterval(() => {
    const timeEl = document.querySelector('.media-lab-progress-time');
    if (!timeEl) return;
    const pending = VIDEOS.gallery.find(v => v.status === 'pending');
    if (!pending?.createdAt) return;
    const elapsed = Math.floor((Date.now() - pending.createdAt) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    timeEl.textContent = `Elapsed: ${mins > 0 ? mins + 'm ' : ''}${secs}s — est. 1-3 min`;
  }, 1000);
}

function stopElapsedTimer() {
  if (_elapsedTimerId) { clearInterval(_elapsedTimerId); _elapsedTimerId = null; }
}

function startVideoPolling(entry) {
  if (!entry.operationName) return;

  let failures = 0;
  const MAX_FAILURES = 36;

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
        stopElapsedTimer();
        saveVideoHistory();
        renderVideoState();
      } else if (data.status === 'failed') {
        entry.status = 'failed';
        entry.error = data.error || 'Unknown error';
        clearInterval(intervalId);
        VIDEOS.pollIntervals.delete(entry.operationName);
        VIDEOS.isGenerating = false;
        stopElapsedTimer();
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
        stopElapsedTimer();
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
  link.href = videoSrc(uri);
  link.download = `meterflow-video-${Date.now()}.mp4`;
  link.click();
}

function fillVideoPrompt(text) {
  const el = document.getElementById('videoPrompt');
  if (el) { el.value = text; el.focus(); }
}

function setVideoAspect(val) {
  VIDEOS._selectedAspect = val;
  const group = document.getElementById('videoAspectGroup');
  if (group) {
    group.querySelectorAll('.media-lab-segment-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === val);
    });
  }
}

function setVideoDuration(val) {
  VIDEOS._selectedDuration = val;
  const group = document.getElementById('videoDurationGroup');
  if (group) {
    group.querySelectorAll('.media-lab-segment-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === val);
    });
  }
}

function copyVideoPrompt(idx) {
  const v = VIDEOS.gallery[idx];
  if (!v) return;
  navigator.clipboard.writeText(v.prompt).catch(() => {});
  if (showToast) showToast('Prompt copied');
}

function openVideoLightbox(idx) {
  const v = VIDEOS.gallery[idx];
  if (!v?.uri) return;
  const container = document.getElementById('mediaLabLightbox');
  if (!container) return;

  const safePrompt = escapeHtml(v.prompt);
  container.innerHTML = `
    <div class="media-lab-lightbox" onclick="if(event.target===this)closeMediaLightbox()">
      <button class="media-lab-lightbox-close" onclick="closeMediaLightbox()">&times;</button>
      <div class="media-lab-lightbox-inner">
        <video controls autoplay src="${videoSrc(v.uri)}"></video>
        <div class="media-lab-lightbox-prompt">${safePrompt}</div>
        <div class="media-lab-lightbox-actions">
          <button class="media-lab-lightbox-btn" onclick="downloadVideo('${v.uri}')">Save</button>
          <button class="media-lab-lightbox-btn" onclick="copyVideoPrompt(${idx})">Copy Prompt</button>
        </div>
      </div>
    </div>
  `;

  const onEsc = (e) => {
    if (e.key === 'Escape') { closeMediaLightbox(); document.removeEventListener('keydown', onEsc); }
  };
  document.addEventListener('keydown', onEsc);
}

function closeMediaLightbox() {
  const container = document.getElementById('mediaLabLightbox');
  if (container) container.innerHTML = '';
}

// Attach to window for onclick handlers
window.generateVideo = generateVideo;
window.downloadVideo = downloadVideo;
window.fillVideoPrompt = fillVideoPrompt;
window.setVideoAspect = setVideoAspect;
window.setVideoDuration = setVideoDuration;
window.copyVideoPrompt = copyVideoPrompt;
window.openVideoLightbox = openVideoLightbox;
window.closeMediaLightbox = closeMediaLightbox;
