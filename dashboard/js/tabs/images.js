// ═══════════════════════════════════════════
// Meterflow Dashboard - Tab: Image Route
// ═══════════════════════════════════════════

import { STATE, IMAGES } from '../state.js';
import { escapeHtml } from '../utils.js';
import { isHolder, renderHolderGate } from '../gate.js';

const IMAGE_CHIPS = [
  'Cyberpunk cityscape at sunset',
  'Oil painting portrait, Renaissance style',
  'Product mockup on marble surface',
  'Isometric low-poly landscape',
  'Watercolor botanical illustration',
  'Neon-lit Tokyo alley at night',
  'Abstract geometric pattern',
  'Concept art spaceship interior',
];

const SPARKLE_SVG = `<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
</svg>`;

export function renderImages() {
  if (!isHolder()) {
    return `
      <div class="page-header">
        <h1 class="page-title">Image Route</h1>
        <p class="page-sub">Generate images with Gemini. Describe anything — photorealistic, illustration, concept art.</p>
      </div>
      ${renderHolderGate('Image Route')}
    `;
  }

  if (!STATE.providers.gemini) {
    return `
      <div class="page-header">
        <h1 class="page-title">Image Route</h1>
        <p class="page-sub">Generate images with Gemini. Describe anything — photorealistic, illustration, concept art.</p>
      </div>
      <div class="media-lab-gate">
        <h3>Provider Key Required</h3>
        <p>Image generation is ready when a Gemini provider key is configured for this route.</p>
        <p class="media-lab-gate-hint">This route requires an image provider integration and settlement wallet policy.</p>
      </div>
    `;
  }

  return `
    <div class="page-header">
      <h1 class="page-title">Image Route</h1>
      <p class="page-sub">Generate images with Gemini. Describe anything — photorealistic, illustration, concept art.</p>
    </div>

    <div class="media-lab-composer">
      <textarea class="media-lab-textarea" id="imagePrompt" rows="3"
        placeholder="Describe what you want to create — a cyberpunk cityscape, an oil painting, a product mockup..."
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();generateImage()}"></textarea>
      <div class="media-lab-action-bar">
        <span class="media-lab-badge">GEMINI</span>
        <button class="media-lab-gen-btn" id="imageGenBtn" onclick="generateImage()" ${IMAGES.isGenerating ? 'disabled' : ''}>
          ${IMAGES.isGenerating ? 'GENERATING...' : 'CREATE'}
        </button>
      </div>
    </div>

    <div class="media-lab-chips">
      ${IMAGE_CHIPS.map(c => `<button class="media-lab-chip" onclick="fillImagePrompt('${escapeHtml(c)}')">${escapeHtml(c)}</button>`).join('')}
    </div>

    <div class="section">
      <div class="section-title">Generated Images</div>
      <div class="media-lab-gallery" id="imageGallery">
        ${renderImageGalleryHTML()}
      </div>
    </div>

    <div id="mediaLabLightbox"></div>
  `;
}

function renderImageGalleryHTML() {
  if (IMAGES.isGenerating) {
    const skeletons = `
      <div class="media-lab-skeleton">
        <div class="media-lab-skeleton-img"></div>
        <div class="media-lab-skeleton-bar"><div class="media-lab-skeleton-text"></div></div>
      </div>
    `;
    return skeletons + IMAGES.gallery.map((img, idx) => renderImageCard(img, idx)).join('');
  }

  if (IMAGES.gallery.length === 0) {
    return `
      <div class="media-lab-empty">
        <div class="media-lab-empty-icon">${SPARKLE_SVG}</div>
        <h3>No images yet</h3>
        <p>Describe anything you can imagine — photorealistic renders, illustrations, concept art, or abstract designs.</p>
        <button class="media-lab-empty-btn" onclick="fillImagePrompt('A cyberpunk cityscape at sunset with neon signs and flying cars')">Try an example</button>
      </div>
    `;
  }

  return IMAGES.gallery.map((img, idx) => renderImageCard(img, idx)).join('');
}

function renderImageCard(img, idx) {
  const safePrompt = escapeHtml(img.prompt);
  return `
    <div class="media-lab-card">
      <img src="data:${escapeHtml(img.mimeType)};base64,${img.data}" alt="${safePrompt}" loading="lazy"
        onclick="openImageLightbox(${idx})">
      <div class="media-lab-card-overlay">
        <div class="media-lab-card-overlay-prompt">${safePrompt}</div>
        <div class="media-lab-card-actions">
          <button class="media-lab-card-action" onclick="event.stopPropagation();downloadImageByIndex(${idx})">Save</button>
          <button class="media-lab-card-action" onclick="event.stopPropagation();copyImagePrompt(${idx})">Copy Prompt</button>
          <button class="media-lab-card-action" onclick="event.stopPropagation();openImageLightbox(${idx})">Expand</button>
        </div>
      </div>
    </div>
  `;
}

function fillImagePrompt(text) {
  const el = document.getElementById('imagePrompt');
  if (el) { el.value = text; el.focus(); }
}

function copyImagePrompt(idx) {
  const img = IMAGES.gallery[idx];
  if (!img) return;
  navigator.clipboard.writeText(img.prompt).catch(() => {});
  const toast = window.showToast || window.__showToast;
  if (toast) toast('Prompt copied');
}

function openImageLightbox(idx) {
  const img = IMAGES.gallery[idx];
  if (!img) return;
  const container = document.getElementById('mediaLabLightbox');
  if (!container) return;

  const safePrompt = escapeHtml(img.prompt);
  container.innerHTML = `
    <div class="media-lab-lightbox" onclick="if(event.target===this)closeMediaLightbox()">
      <button class="media-lab-lightbox-close" onclick="closeMediaLightbox()">&times;</button>
      <div class="media-lab-lightbox-inner">
        <img src="data:${escapeHtml(img.mimeType)};base64,${img.data}" alt="${safePrompt}">
        <div class="media-lab-lightbox-prompt">${safePrompt}</div>
        <div class="media-lab-lightbox-actions">
          <button class="media-lab-lightbox-btn" onclick="downloadImageByIndex(${idx})">Save</button>
          <button class="media-lab-lightbox-btn" onclick="copyImagePrompt(${idx})">Copy Prompt</button>
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
window.fillImagePrompt = fillImagePrompt;
window.copyImagePrompt = copyImagePrompt;
window.openImageLightbox = openImageLightbox;
window.closeMediaLightbox = closeMediaLightbox;
