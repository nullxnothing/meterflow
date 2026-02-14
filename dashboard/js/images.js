// ═══════════════════════════════════════════
// INFINITE Dashboard - Image Management
// ═══════════════════════════════════════════

import { CHAT, IMAGES } from './state.js';
import { api, escapeHtml } from './api.js';
import { showToast } from './actions.js';

// ─── Image Upload ───

export function handleImageUpload(files) {
  if (!files || files.length === 0) return;
  const maxFiles = 4;
  const maxSize = 5 * 1024 * 1024; // 5MB

  for (const file of Array.from(files).slice(0, maxFiles - CHAT.pendingImages.length)) {
    if (!file.type.startsWith('image/')) continue;
    if (file.size > maxSize) { showToast('Image too large (max 5MB)', true); continue; }

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

  const html = CHAT.pendingImages.map((img, i) => `
    <div class="chat-image-thumb">
      <img src="data:${img.mimeType};base64,${img.data}" alt="upload">
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
  if (gallery) {
    gallery.innerHTML = IMAGES.isGenerating
      ? `<div class="image-loading"><div class="image-spinner"></div><span style="font-family:var(--font-mono);font-size:11px;">Generating image...</span></div>`
      : IMAGES.gallery.map(img => `
        <div class="image-card">
          <img src="data:${img.mimeType};base64,${img.data}" alt="${escapeHtml(img.prompt)}" loading="lazy">
          <div class="image-card-footer">
            <div class="image-card-prompt">${escapeHtml(img.prompt)}</div>
            <button class="btn-sm" onclick="downloadImage('${img.data}','${img.mimeType}')">Save</button>
          </div>
        </div>
      `).join('') || '<div style="color:var(--text-muted);font-family:var(--font-mono);font-size:12px;padding:40px;text-align:center;">No images yet. Describe what you want to create.</div>';
  }
}

export function downloadImage(base64, mimeType) {
  const link = document.createElement('a');
  link.href = `data:${mimeType};base64,${base64}`;
  link.download = `infinite-${Date.now()}.png`;
  link.click();
}

// Attach to window for onclick handlers
window.removePendingImage = removePendingImage;
window.generateImage = generateImage;
window.downloadImage = downloadImage;
