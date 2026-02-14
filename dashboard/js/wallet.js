// ═══════════════════════════════════════════
// INFINITE Dashboard - Wallet Management
// ═══════════════════════════════════════════

import { STATE, CHAT } from './state.js';
import { api, maskKey } from './api.js';
import { saveSession } from './session.js';
import { startStatusPolling } from './polling.js';
import { render } from './render.js';

// ─── Wallet Icons ───

export const WALLET_ICONS = {
  phantom: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDgiIGhlaWdodD0iMTA4IiB2aWV3Qm94PSIwIDAgMTA4IDEwOCIgZmlsbD0ibm9uZSI+CjxyZWN0IHdpZHRoPSIxMDgiIGhlaWdodD0iMTA4IiByeD0iMjYiIGZpbGw9IiNBQjlGRjIiLz4KPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik00Ni41MjY3IDY5LjkyMjlDNDIuMDA1NCA3Ni44NTA5IDM0LjQyOTIgODUuNjE4MiAyNC4zNDggODUuNjE4MkMxOS41ODI0IDg1LjYxODIgMTUgODMuNjU2MyAxNSA3NS4xMzQyQzE1IDUzLjQzMDUgNDQuNjMyNiAxOS44MzI3IDcyLjEyNjggMTkuODMyN0M4Ny43NjggMTkuODMyNyA5NCAzMC42ODQ2IDk0IDQzLjAwNzlDOTQgNTguODI1OCA4My43MzU1IDc2LjkxMjIgNzMuNTMyMSA3Ni45MTIyQzcwLjI5MzkgNzYuOTEyMiA2OC43MDUzIDc1LjEzNDIgNjguNzA1MyA3Mi4zMTRDNjguNzA1MyA3MS41NzgzIDY4LjgyNzUgNzAuNzgxMiA2OS4wNzE5IDY5LjkyMjlDNjUuNTg5MyA3NS44Njk5IDU4Ljg2ODUgODEuMzg3OCA1Mi41NzU0IDgxLjM4NzhDNDcuOTkzIDgxLjM4NzggNDUuNjcxMyA3OC41MDYzIDQ1LjY3MTMgNzQuNDU5OEM0NS42NzEzIDcyLjk4ODQgNDUuOTc2OCA3MS40NTU2IDQ2LjUyNjcgNjkuOTIyOVpNODMuNjc2MSA0Mi41Nzk0QzgzLjY3NjEgNDYuMTcwNCA4MS41NTc1IDQ3Ljk2NTggNzkuMTg3NSA0Ny45NjU4Qzc2Ljc4MTYgNDcuOTY1OCA3NC42OTg5IDQ2LjE3MDQgNzQuNjk4OSA0Mi41Nzk0Qzc0LjY5ODkgMzguOTg4NSA3Ni43ODE2IDM3LjE5MzEgNzkuMTg3NSAzNy4xOTMxQzgxLjU1NzUgMzcuMTkzMSA4My42NzYxIDM4Ljk4ODUgODMuNjc2MSA0Mi41Nzk0Wk03MC4yMTAzIDQyLjU3OTVDNzAuMjEwMyA0Ni4xNzA0IDY4LjA5MTYgNDcuOTY1OCA2NS43MjE2IDQ3Ljk2NThDNjMuMzE1NyA0Ny45NjU4IDYxLjIzMyA0Ni4xNzA0IDYxLjIzMyA0Mi41Nzk1QzYxLjIzMyAzOC45ODg1IDYzLjMxNTcgMzcuMTkzMSA2NS43MjE2IDM3LjE5MzFDNjguMDkxNiAzNy4xOTMxIDcwLjIxMDMgMzguOTg4NSA3MC4yMTAzIDQyLjU3OTVaIiBmaWxsPSIjRkZGREY4Ii8+Cjwvc3ZnPg==',
  backpack: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiB2aWV3Qm94PSIwIDAgMTI4IDEyOCIgZmlsbD0ibm9uZSI+PHJlY3Qgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIHJ4PSIyNiIgZmlsbD0iIzE5MTkxOSIvPjxwYXRoIGQ9Ik00NC44IDQ0LjhWMzguNGMwLTEwLjYgOC42LTE5LjIgMTkuMi0xOS4yczE5LjIgOC42IDE5LjIgMTkuMnY2LjQiIHN0cm9rZT0iI0UzM0UzRiIgc3Ryb2tlLXdpZHRoPSI2IiBzdHJva2UtbGluZWNhcD0icm91bmQiIGZpbGw9Im5vbmUiLz48cmVjdCB4PSIzMiIgeT0iNTEuMiIgd2lkdGg9IjY0IiBoZWlnaHQ9IjQ0LjgiIHJ4PSIxMiIgZmlsbD0iI0UzM0UzRiIvPjxyZWN0IHg9IjQ4IiB5PSI2NyIgd2lkdGg9IjMyIiBoZWlnaHQ9IjgiIHJ4PSI0IiBmaWxsPSIjMTkxOTE5Ii8+PC9zdmc+',
  solflare: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz48c3ZnIGlkPSJTIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MCA1MCI+PGRlZnM+PHN0eWxlPi5jbHMtMXtmaWxsOiMwMjA1MGE7c3Ryb2tlOiNmZmVmNDY7c3Ryb2tlLW1pdGVybGltaXQ6MTA7c3Ryb2tlLXdpZHRoOi41cHg7fS5jbHMtMntmaWxsOiNmZmVmNDY7fTwvc3R5bGU+PC9kZWZzPjxyZWN0IGNsYXNzPSJjbHMtMiIgeD0iMCIgd2lkdGg9IjUwIiBoZWlnaHQ9IjUwIiByeD0iMTIiIHJ5PSIxMiIvPjxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTI0LjIzLDI2LjQybDIuNDYtMi4zOCw0LjU5LDEuNWMzLjAxLDEsNC41MSwyLjg0LDQuNTEsNS40MywwLDEuOTYtLjc1LDMuMjYtMi4yNSw0LjkzbC0uNDYuNS4xNy0xLjE3Yy42Ny00LjI2LS41OC02LjA5LTQuNzItNy40M2wtNC4zLTEuMzhoMFpNMTguMDUsMTEuODVsMTIuNTIsNC4xNy0yLjcxLDIuNTktNi41MS0yLjE3Yy0yLjI1LS43NS0zLjAxLTEuOTYtMy4zLTQuNTF2LS4wOGgwWk0xNy4zLDMzLjA2bDIuODQtMi43MSw1LjM0LDEuNzVjMi44LjkyLDMuNzYsMi4xMywzLjQ2LDUuMThsLTExLjY1LTQuMjJoMFpNMTMuNzEsMjAuOTVjMC0uNzkuNDItMS41NCwxLjEzLTIuMTcuNzUsMS4wOSwyLjA1LDIuMDUsNC4wOSwyLjcxbDQuNDIsMS40Ni0yLjQ2LDIuMzgtNC4zNC0xLjQyYy0yLS42Ny0yLjg0LTEuNjctMi44NC0yLjk2TTI2LjgyLDQyLjg3YzkuMTgtNi4wOSwxNC4xMS0xMC4yMywxNC4xMS0xNS4zMiwwLTMuMzgtMi01LjI2LTYuNDMtNi43MmwtMy4zNC0xLjEzLDkuMTQtOC43Ny0xLjg0LTEuOTYtMi43MSwyLjM4LTEyLjgxLTQuMjJjLTMuOTcsMS4yOS04Ljk3LDUuMDktOC45Nyw4Ljg5LDAsLjQyLjA0LjgzLjE3LDEuMjktMy4zLDEuODgtNC42MywzLjYzLTQuNjMsNS44LDAsMi4wNSwxLjA5LDQuMDksNC41NSw1LjIybDIuNzUuOTItOS41Miw5LjE0LDEuODQsMS45NiwyLjk2LTIuNzEsMTQuNzMsNS4yMmgwWiIvPjwvc3ZnPg==',
};

// ─── Wallet Detection ───

export function getWalletProviders() {
  const providers = [];
  if (window.phantom?.solana?.isPhantom) {
    const p = window.phantom.solana;
    providers.push({ name: 'Phantom', provider: p, icon: p.icon || WALLET_ICONS.phantom });
  }
  if (window.backpack?.isBackpack) {
    const p = window.backpack;
    providers.push({ name: 'Backpack', provider: p, icon: p.icon || WALLET_ICONS.backpack });
  }
  if (window.solflare?.isSolflare) {
    const p = window.solflare;
    providers.push({ name: 'Solflare', provider: p, icon: p.icon || WALLET_ICONS.solflare });
  }
  return providers;
}

// ─── Wallet Connect ───

export async function connectWallet(providerObj) {
  STATE.connecting = true;
  STATE.error = null;
  render();

  try {
    const provider = providerObj || getWalletProviders()[0]?.provider;
    if (!provider) throw new Error('No Solana wallet found. Install Phantom, Backpack, or Solflare.');

    const resp = await provider.connect();
    const publicKey = resp.publicKey.toString();
    const message = `INFINITE Protocol: Verify wallet ownership\n\nWallet: ${publicKey}\nTimestamp: ${Date.now()}`;
    const encoded = new TextEncoder().encode(message);
    const signatureBytes = await provider.signMessage(encoded, 'utf8');
    const sig = btoa(String.fromCharCode(...new Uint8Array(signatureBytes.signature || signatureBytes)));

    const data = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ wallet: publicKey, signature: sig, message }),
    });

    STATE.connected = true;
    STATE.wallet = publicKey;
    STATE.walletProvider = provider;
    STATE.apiKeyFull = data.apiKey;
    STATE.apiKey = maskKey(data.apiKey);
    STATE.tier = data.tier;
    STATE.balance = data.balance;
    STATE.models = data.models || [];
    STATE.usage = { today: 0, limit: data.dailyLimit, remaining: data.dailyLimit };

    // Default chat model to first available
    if (STATE.models.length && !CHAT.selectedModel) {
      CHAT.selectedModel = STATE.models[0];
    }

    saveSession();
    startStatusPolling();
  } catch (err) {
    STATE.error = err.message || 'Connection failed';
  } finally {
    STATE.connecting = false;
    render();
  }
}

// Attach to window for onclick handlers
window.connectWallet = connectWallet;
