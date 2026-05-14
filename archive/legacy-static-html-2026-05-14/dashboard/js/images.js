// ═══════════════════════════════════════════
// Meterflow Dashboard - Image Management
// ═══════════════════════════════════════════

import { CHAT, IMAGES } from './state.js';
import { api } from './api.js';
import { escapeHtml } from './utils.js';
import { showToast } from './actions.js';

// ─── Image Upload (Chat) ───

export function handleImageUpload(files) {
  if (!files || files.length === 0) return;
  const MAX_FILES = 4;
  const MAX_SIZE = 5 * 1024 * 1024;

  for (const file of Array.from(files).slice(0, MAX_FILES - CHAT.pendingImages.length)) {
    if (!file.type.startsWith('image/')) continue;
    if (file.size > MAX_SIZE) { showToast('Image too large (max 5MB)', true); continue; }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(',')[1];
      CHAT.pendingImages.push({ data: base64, mimeType: file.type, name: file.name });
      renderImagePreview();
    };
    reader.readAsDataURL(file);
  }
}

export function removePendingImage(index) {
  CHAT.pendingImages.splice(index, 1);
  renderImagePreview();
}

export function renderImagePreview() {
  const existing = document.getElementById('chatImagePreview');
  if (CHAT.pendingImages.length === 0) {
    if (existing) existing.remove();
    return;
  }

  const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  const html = CHAT.pendingImages.filter(img => ALLOWED_MIME.includes(img.mimeType)).map((img, i) => `
    <div class="chat-image-thumb">
      <img src="data:${escapeHtml(img.mimeType)};base64,${img.data}" alt="upload">
      <button class="remove-img" onclick="removePendingImage(${i})">x</button>
    </div>
  `).join('');

  if (existing) {
    existing.innerHTML = html;
  } else {
    const inputArea = document.querySelector('.chat-input-area');
    if (inputArea) {
      const preview = document.createElement('div');
      preview.className = 'chat-image-preview';
      preview.id = 'chatImagePreview';
      preview.innerHTML = html;
      inputArea.parentNode.insertBefore(preview, inputArea);
    }
  }
}

// ─── Image Generation ───

export async function generateImage() {
  const input = document.getElementById('imagePrompt');
  if (!input) return;
  const prompt = input.value.trim();
  if (!prompt || IMAGES.isGenerating) return;

  IMAGES.isGenerating = true;
  renderImageState();

  try {
    const data = await api('/v1/image', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    });

    if (data.images?.length > 0) {
      for (const img of data.images) {
        IMAGES.gallery.unshift({
          data: img.data,
          mimeType: img.mimeType,
          prompt,
          text: data.text,
          id: data.id,
        });
      }
    }
    input.value = '';
  } catch (err) {
    showToast(err.message || 'Image generation failed', true);
  } finally {
    IMAGES.isGenerating = false;
    renderImageState();
  }
}

export function renderImageState() {
  const gallery = document.getElementById('imageGallery');
  const btn = document.getElementById('imageGenBtn');

  if (btn) {
    btn.disabled = IMAGES.isGenerating;
    btn.textContent = IMAGES.isGenerating ? 'GENERATING...' : 'CREATE';
  }

  if (!gallery) return;

  if (IMAGES.isGenerating) {
    const skeleton = `
      <div class="media-lab-skeleton">
        <div class="media-lab-skeleton-img"></div>
        <div class="media-lab-skeleton-bar"><div class="media-lab-skeleton-text"></div></div>
      </div>
    `;
    gallery.innerHTML = skeleton + IMAGES.gallery.map((img, idx) => renderImageCardHTML(img, idx)).join('');
    return;
  }

  if (IMAGES.gallery.length === 0) {
    gallery.innerHTML = `
      <div class="media-lab-empty">
        <div class="media-lab-empty-icon">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
          </svg>
        </div>
        <h3>No images yet</h3>
        <p>Describe anything you can imagine — photorealistic renders, illustrations, concept art, or abstract designs.</p>
        <button class="media-lab-empty-btn" onclick="fillImagePrompt('A cyberpunk cityscape at sunset with neon signs and flying cars')">Try an example</button>
      </div>
    `;
    return;
  }

  gallery.innerHTML = IMAGES.gallery.map((img, idx) => renderImageCardHTML(img, idx)).join('');
}

function renderImageCardHTML(img, idx) {
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

export function downloadImage(base64, mimeType) {
  const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  const safeMime = ALLOWED_MIME.includes(mimeType) ? mimeType : 'image/png';
  const link = document.createElement('a');
  link.href = `data:${safeMime};base64,${base64}`;
  link.download = `meterflow-${Date.now()}.png`;
  link.click();
}

export function downloadImageByIndex(idx) {
  const img = IMAGES.gallery[idx];
  if (!img) return;
  downloadImage(img.data, img.mimeType);
}

// Attach to window for onclick handlers
window.removePendingImage = removePendingImage;
window.generateImage = generateImage;
window.downloadImage = downloadImage;
window.downloadImageByIndex = downloadImageByIndex;
