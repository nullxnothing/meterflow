// ═══════════════════════════════════════════
// Meterflow Dashboard - Trading Bot Actions
// ═══════════════════════════════════════════

import { STATE, TRADING } from '../state.js';
import { api } from '../api.js';
import { escapeHtml } from '../utils.js';
import { formatCompact, formatTokenPrice } from '../utils.js';
import { setTab } from '../actions.js';
import { render } from '../render.js';
import { fetchTradingState, renderBotPanelContent } from './trading.js';

// ─── Bot Actions ───

export async function exportBotPrivateKey() {
  if (!confirm('This will display your private key. Never share it with anyone. Continue?')) return;
  try {
    const res = await api('/v1/trading/wallet/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });
    const key = res.privateKey || res.secretKey || '';
    if (key) {
      await navigator.clipboard.writeText(key);
      alert('Private key copied to clipboard.');
    } else {
      alert('Could not retrieve private key.');
    }
  } catch (err) {
    alert('Export failed: ' + (err.message || 'Unknown error'));
  }
}

export async function executeQuickTrade(action) {
  const token = document.getElementById('botQtToken')?.value.trim();
  const amount = parseFloat(document.getElementById('botQtAmount')?.value);
  if (!token || !amount || amount <= 0) return;
  try {
    await api(`/v1/trading/pump/${action}`, { method: 'POST', body: JSON.stringify({ mint: token, amount, denominatedInSol: true, slippage: 15 }) });
    await fetchTradingState();
    render();
  } catch (err) {
    console.error(`Quick ${action} failed:`, err.message);
  }
}

export async function executeSwapForm() {
  const result = document.getElementById('swapResult');
  const inputMint = document.getElementById('swapInputMint')?.value.trim();
  const outputMint = document.getElementById('swapOutputMint')?.value.trim();
  const amount = document.getElementById('swapAmount')?.value.trim();
  const slippageBps = parseInt(document.getElementById('swapSlippage')?.value) || 300;
  if (!inputMint || !outputMint || !amount) { if (result) result.textContent = 'Fill all fields'; return; }
  if (result) result.textContent = 'Executing...';
  try {
    const res = await api('/v1/trading/swap', { method: 'POST', body: JSON.stringify({ inputMint, outputMint, amount, slippageBps }) });
    if (result) result.innerHTML = 'Success: <a class="tx-link" href="https://solscan.io/tx/' + escapeHtml(res.signature) + '" target="_blank">' + escapeHtml(res.signature.slice(0, 16)) + '...</a>';
    await fetchTradingState();
  } catch (err) {
    if (result) result.textContent = 'Failed: ' + err.message;
  }
}

export async function createDCA() {
  const inputMint = document.getElementById('dcaInputMint')?.value.trim();
  const outputMint = document.getElementById('dcaOutputMint')?.value.trim();
  const total = parseInt(document.getElementById('dcaTotal')?.value);
  const perCycle = parseInt(document.getElementById('dcaPerCycle')?.value);
  const interval = parseInt(document.getElementById('dcaInterval')?.value) * 1000;
  if (!inputMint || !outputMint || !total || !perCycle || !interval) return;
  try {
    await api('/v1/trading/dca/create', { method: 'POST', body: JSON.stringify({ inputMint, outputMint, totalAmountLamports: total, amountPerCycleLamports: perCycle, cycleIntervalMs: interval }) });
    await fetchTradingState();
    renderBotPanelContent();
  } catch (err) {
    console.error('DCA create failed:', err.message);
  }
}

export async function cancelDCA(id) {
  try {
    await api(`/v1/trading/dca/${id}/cancel`, { method: 'POST' });
    await fetchTradingState();
    renderBotPanelContent();
  } catch (err) {
    console.error('DCA cancel failed:', err.message);
  }
}

export async function followWallet() {
  const address = document.getElementById('copyAddress')?.value.trim();
  const maxPositionSol = parseFloat(document.getElementById('copyMaxSol')?.value) || 0.5;
  const multiplier = parseFloat(document.getElementById('copyMultiplier')?.value) || 1.0;
  if (!address) return;
  try {
    await api('/v1/trading/copy/follow', { method: 'POST', body: JSON.stringify({ address, maxPositionSol, multiplier }) });
    await fetchTradingState();
    renderBotPanelContent();
  } catch (err) {
    console.error('Follow failed:', err.message);
  }
}

export async function unfollowWallet(targetId) {
  try {
    await api('/v1/trading/copy/unfollow', { method: 'POST', body: JSON.stringify({ targetId }) });
    await fetchTradingState();
    renderBotPanelContent();
  } catch (err) {
    console.error('Unfollow failed:', err.message);
  }
}

export async function startCopyTrading() {
  try { await api('/v1/trading/copy/start', { method: 'POST' }); } catch (err) { console.error(err.message); }
}

export async function stopCopyTrading() {
  try { await api('/v1/trading/copy/stop', { method: 'POST' }); } catch (err) { console.error(err.message); }
}

export async function createTrigger() {
  const mint = document.getElementById('trigMint')?.value.trim();
  const condType = document.getElementById('trigCondType')?.value;
  const price = parseFloat(document.getElementById('trigPrice')?.value);
  const action = document.getElementById('trigAction')?.value;
  const amount = document.getElementById('trigAmount')?.value;
  if (!mint || !condType || !price || !action || !amount) return;

  const inputMint = action === 'buy' ? 'So11111111111111111111111111111111111111112' : mint;
  const outputMint = action === 'buy' ? mint : 'So11111111111111111111111111111111111111112';

  try {
    await api('/v1/trading/trigger/create', { method: 'POST', body: JSON.stringify({
      mint, condition: { type: condType, price }, order: { action, inputMint, outputMint, amount, slippageBps: 500 }
    })});
    await fetchTradingState();
    renderBotPanelContent();
  } catch (err) {
    console.error('Trigger create failed:', err.message);
  }
}

export async function cancelTrigger(id) {
  try {
    await api(`/v1/trading/trigger/${id}/cancel`, { method: 'POST' });
    await fetchTradingState();
    renderBotPanelContent();
  } catch (err) {
    console.error('Trigger cancel failed:', err.message);
  }
}

export async function botKill() {
  try {
    await api('/v1/trading/safety/kill', { method: 'POST', body: JSON.stringify({ reason: 'Dashboard kill switch' }) });
    await fetchTradingState();
    render();
  } catch (err) {
    console.error('Kill switch failed:', err.message);
  }
}

export async function botResume() {
  try {
    await api('/v1/trading/safety/resume', { method: 'POST' });
    await fetchTradingState();
    render();
  } catch (err) {
    console.error('Resume failed:', err.message);
  }
}

// ─── Token Lookup ───

export async function lookupToken() {
  const input = document.getElementById('chatTokenAddr');
  if (!input) return;
  const address = input.value.trim();
  if (!address) return;

  const card = document.getElementById('tokenInfoCard');
  if (card) card.innerHTML = '<div class="u-spinner-wrap"><div class="image-spinner"></div></div>';

  try {
    const info = await api(`/v1/trading/token/${address}`);
    TRADING.tokenInfo = info;
    renderTokenInfoCard(info);
    sendTradingQuery(`Analyze this token in detail: ${info.name || 'Unknown'} (${info.symbol || '?'}) at address ${address}. Give me a full breakdown: risk level, liquidity analysis, price action assessment, and whether it looks like a good opportunity right now.`, address);
  } catch (err) {
    if (card) card.innerHTML = `<div class="u-lookup-error">Lookup failed: ${escapeHtml(err.message || 'Unknown error')}</div>`;
  }
}

export function renderTokenInfoCard(info) {
  const card = document.getElementById('tokenInfoCard');
  if (!card) return;

  const changeClass = (info.change24h || 0) >= 0 ? 'green' : 'red';
  const changePrefix = (info.change24h || 0) >= 0 ? '+' : '';

  card.innerHTML = `
    <div class="token-info-card u-mt-3">
      <div class="token-info-header">
        <span class="token-info-name">${escapeHtml(info.name || 'Unknown')}</span>
        <span class="token-info-symbol">$${escapeHtml(info.symbol || '?')}</span>
      </div>
      <div class="token-info-stats">
        <div class="token-info-stat"><div class="label">Price</div><div class="val">${info.price ? '$' + formatTokenPrice(info.price) : '—'}</div></div>
        <div class="token-info-stat"><div class="label">24h</div><div class="val ${changeClass}">${info.change24h !== null ? changePrefix + info.change24h + '%' : '—'}</div></div>
        <div class="token-info-stat"><div class="label">Mkt Cap</div><div class="val">${info.marketCap ? '$' + formatCompact(info.marketCap) : '—'}</div></div>
        <div class="token-info-stat"><div class="label">Liquidity</div><div class="val">${info.liquidity ? '$' + formatCompact(info.liquidity) : '—'}</div></div>
      </div>
    </div>
  `;
}

export function sendTradingQuery(preset, tokenAddress) {
  setTab('chat');
  setTimeout(() => {
    const input = document.getElementById('chatInput');
    if (input && preset) {
      input.value = preset;
      import('../chat.js').then(mod => mod.sendChatMessage());
    }
  }, 100);
}

// ─── Window Assignments ───

window.exportBotPrivateKey = exportBotPrivateKey;
window.executeQuickTrade = executeQuickTrade;
window.executeSwapForm = executeSwapForm;
window.createDCA = createDCA;
window.cancelDCA = cancelDCA;
window.followWallet = followWallet;
window.unfollowWallet = unfollowWallet;
window.startCopyTrading = startCopyTrading;
window.stopCopyTrading = stopCopyTrading;
window.createTrigger = createTrigger;
window.cancelTrigger = cancelTrigger;
window.botKill = botKill;
window.botResume = botResume;
window.lookupToken = lookupToken;
window.sendTradingQuery = sendTradingQuery;
