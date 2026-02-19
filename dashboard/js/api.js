// ═══════════════════════════════════════════
// INFINITE Dashboard — API Helpers
// ═══════════════════════════════════════════

import { STATE, API_BASE } from './state.js';

export { API_BASE };

// ─── API Request Helper ───

export async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  if (STATE.apiKeyFull) headers['Authorization'] = `Bearer ${STATE.apiKeyFull}`;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  } catch {
    throw new Error('API unreachable. The proxy server may not be deployed yet.');
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Server error: ${res.status}`); }
  if (!res.ok) throw { status: res.status, message: data.message || data.error, ...data };
  return data;
}

// ─── Formatting Helpers ───

export function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function maskKey(key) {
  if (!key) return 'No key';
  return key.slice(0, 18) + '...' + key.slice(-4);
}
