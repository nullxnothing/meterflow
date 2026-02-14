// ═══════════════════════════════════════════
// INFINITE Dashboard - Tab: Image Lab
// ═══════════════════════════════════════════

import { STATE, IMAGES } from '../state.js';
import { escapeHtml } from '../api.js';

export function renderImages() {
  if (!STATE.providers.gemini) {
    return `
      <div class="page-header">
        <h1 class="page-title">Image Lab</h1>
        <p class="page-sub">Generate images with Gemini. Describe anything — photorealistic, illustration, concept art.</p>
      </div>
      <div class="video-tier-gate">
        <h3>Coming Soon</h3>
        <p>Image generation will activate after token launch. Powered by Google Gemini.</p>
        <p style="color:var(--text-muted);font-family:var(--font-mono);font-size:11px;margin-top:16px;">This feature requires the Gemini API to be configured by the protocol treasury.</p>
      </div>
    `;
  }

  return `
    <div class="page-header">
      <h1 class="page-title">Image Lab</h1>
      <p class="page-sub">Generate images with Gemini. Describe anything — photorealistic, illustration, concept art.</p>
    </div>
    <div class="image-prompt-area">
      <input type="text" class="image-prompt-input" id="imagePrompt" placeholder="A cyberpunk cityscape at sunset with neon signs..."
        onkeydown="if(event.key==='Enter')generateImage()">
      <button class="image-gen-btn" id="imageGenBtn" onclick="generateImage()" ${IMAGES.isGenerating ? 'disabled' : ''}>
        ${IMAGES.isGenerating ? 'GENERATING...' : 'CREATE'}
      </button>
    </div>
    <div class="section">
      <div class="section-title">Generated Images</div>
      <div class="image-gallery" id="imageGallery">
        ${IMAGES.isGenerating ? `
          <div class="image-loading"><div class="image-spinner"></div><span style="font-family:var(--font-mono);font-size:11px;">Generating image...</span></div>
        ` : IMAGES.gallery.length ? IMAGES.gallery.map(img => `
          <div class="image-card">
            <img src="data:${img.mimeType};base64,${img.data}" alt="${escapeHtml(img.prompt)}" loading="lazy">
            <div class="image-card-footer">
              <div class="image-card-prompt">${escapeHtml(img.prompt)}</div>
              <button class="btn-sm" onclick="downloadImage('${img.data}','${img.mimeType}')">Save</button>
            </div>
          </div>
        `).join('') : `
          <div style="color:var(--text-muted);font-family:var(--font-mono);font-size:12px;padding:60px;text-align:center;">
            No images yet. Describe what you want to create.
          </div>
        `}
      </div>
    </div>
  `;
}
