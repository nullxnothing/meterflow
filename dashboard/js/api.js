// ═══════════════════════════════════════════
// INFINITE Dashboard — API Helpers
// ═══════════════════════════════════════════

import { STATE, API_BASE } from './state.js';

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
  if (!res.ok) {
    const err = new Error(data.message || data.error || `HTTP ${res.status}`);
    err.status = res.status;
    Object.assign(err, data);
    throw err;
  }
  return data;
}
