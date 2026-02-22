// ═══════════════════════════════════════════
// INFINITE Dashboard — Tab: My Agents
// Recipe-based launcher UX
// ═══════════════════════════════════════════

import { STATE, AGENTS } from '../state.js';
import { api } from '../api.js';
import { render } from '../render.js';
import { showToast } from '../actions.js';
import {
  renderNotifPanel, renderRecipeGrid, renderRecipeSetup,
  renderAgentCard, renderAgentDetail,
} from './my-agents-views.js';

// ─── Data Loading ───

export async function loadAgentTemplates() {
  if (AGENTS.templates.length) return;
  try {
    const data = await api('/v1/agents/templates');
    AGENTS.templates = data.templates || [];
  } catch (err) {
    console.error('Failed to load agent templates:', err);
  }
}

export async function loadMyAgents() {
  try {
    const data = await api('/v1/agents');
    AGENTS.list = data.agents || [];
  } catch (err) {
    console.error('Failed to load agents:', err);
  }
}

async function loadAgentActivity() {
  try {
    const data = await api('/v1/agents/activity?limit=20');
    AGENTS.activity = data.activity || [];
  } catch (e) {
    console.error('Failed to load agent activity:', e);
  }
}

// ─── Recipe Setup Flow ───

export function openRecipeSetup(recipeId) {
  AGENTS.setupRecipe = recipeId;
  AGENTS.setupConfig = {};
  const tmpl = AGENTS.templates.find(t => t.id === recipeId);
  if (tmpl) {
    AGENTS.setupConfig.schedule = tmpl.defaultSchedule;
  }
  render();
}

export function closeRecipeSetup() {
  AGENTS.setupRecipe = null;
  AGENTS.setupConfig = {};
  render();
}

export function setRecipeSchedule(value) {
  AGENTS.setupConfig.schedule = value;
  render();
}

export function setAgentCategory(categoryId) {
  AGENTS.activeCategory = categoryId;
  render();
}

function collectRecipeConfig() {
  const tmpl = AGENTS.templates.find(t => t.id === AGENTS.setupRecipe);
  if (!tmpl) return {};
  const config = { ...AGENTS.setupConfig };
  for (const f of (tmpl.configFields || [])) {
    const el = document.getElementById(`recipeField_${f.id}`);
    if (el) config[f.id] = el.value;
  }
  return config;
}

export async function activateRecipe() {
  if (!AGENTS.setupRecipe) return;
  AGENTS.loading = true;
  render();

  try {
    const config = collectRecipeConfig();
    const tmpl = AGENTS.templates.find(t => t.id === AGENTS.setupRecipe);

    const body = {
      template: AGENTS.setupRecipe,
      name: tmpl?.name || 'My Agent',
      model: tmpl?.defaultModel || 'gemini-2.5-flash',
      schedule: config.schedule || tmpl?.defaultSchedule || '0 */6 * * *',
      config,
    };

    const data = await api('/v1/agents', { method: 'POST', body: JSON.stringify(body) });

    if (data.ok) {
      // Auto-activate the agent
      try {
        await api(`/v1/agents/${data.agent.id}/activate`, { method: 'POST' });
        showToast('Agent activated');
      } catch {
        showToast('Agent created (activation failed — activate manually)');
      }

      AGENTS.setupRecipe = null;
      AGENTS.setupConfig = {};
      await loadMyAgents();
    } else {
      showToast(data.message || data.error || 'Failed to create agent', true);
    }
  } catch (err) {
    showToast(err.message || 'Failed to create agent', true);
  }

  AGENTS.loading = false;
  render();
}

// ─── Agent Actions ───

export async function agentAction(agentId, action) {
  try {
    if (action === 'delete') {
      if (!confirm('Delete this agent? This cannot be undone.')) return;
      await api(`/v1/agents/${agentId}`, { method: 'DELETE' });
      showToast('Agent deleted');
      AGENTS.selectedAgent = null;
    } else if (action === 'activate') {
      await api(`/v1/agents/${agentId}/activate`, { method: 'POST' });
      showToast('Agent activated');
    } else if (action === 'pause') {
      await api(`/v1/agents/${agentId}/pause`, { method: 'POST' });
      showToast('Agent paused');
    } else if (action === 'run') {
      AGENTS.runningAgents.add(agentId);
      render();
      showToast('Running agent...');
      try {
        const data = await api(`/v1/agents/${agentId}/run`, { method: 'POST' });
        if (data.ok) {
          showToast('Agent run complete');
          pushAgentNotification(agentId, 'run_complete', 'Run completed');
        } else {
          showToast(data.error || 'Run failed', true);
          pushAgentNotification(agentId, 'run_error', data.error || 'Run failed');
        }
      } finally {
        AGENTS.runningAgents.delete(agentId);
      }
    }
    await loadMyAgents();
    await loadAgentActivity();
    render();
  } catch (err) {
    AGENTS.runningAgents.delete(agentId);
    showToast(err.message, true);
    render();
  }
}

export function selectAgent(agentId) {
  AGENTS.selectedAgent = agentId || null;
  AGENTS.notifOpen = false;
  render();
}

// ─── Polling ───

export function startAgentPolling() {
  if (AGENTS.pollInterval) return;
  AGENTS.pollInterval = setInterval(async () => {
    if (STATE.activeTab !== 'my-agents') {
      clearInterval(AGENTS.pollInterval);
      AGENTS.pollInterval = null;
      return;
    }
    try {
      const oldList = JSON.stringify(AGENTS.list.map(a => ({ s: a.status, r: a.runCount, lr: a.lastRun })));
      await loadMyAgents();
      const newList = JSON.stringify(AGENTS.list.map(a => ({ s: a.status, r: a.runCount, lr: a.lastRun })));
      if (oldList !== newList) {
        await loadAgentActivity();
        render();
      }
    } catch {}
  }, 15000);
}

export function stopAgentPolling() {
  if (AGENTS.pollInterval) {
    clearInterval(AGENTS.pollInterval);
    AGENTS.pollInterval = null;
  }
}

// ─── Helpers ───

function pushAgentNotification(agentId, type, message) {
  const agent = AGENTS.list.find(a => a.id === agentId);
  AGENTS.notifications.unshift({
    agentId,
    agentName: agent?.name || 'Agent',
    template: agent?.template || 'custom',
    type,
    message,
    ts: Date.now(),
  });
  if (AGENTS.notifications.length > 50) AGENTS.notifications.length = 50;
}

// ─── Main Render ───

export function renderMyAgents() {
  if (!AGENTS.templates.length && !AGENTS.loading) {
    AGENTS.loading = true;
    loadAgentTemplates().then(() => loadMyAgents()).then(() => loadAgentActivity()).then(() => {
      AGENTS.loading = false;
      startAgentPolling();
      render();
    }).catch(() => { AGENTS.loading = false; });
  }

  // Detail view
  if (AGENTS.selectedAgent) {
    return renderAgentDetail();
  }

  // Inline setup
  if (AGENTS.setupRecipe) {
    return renderRecipeSetup();
  }

  // Main view
  const agents = AGENTS.list;
  const notifUnseen = AGENTS.notifications.length - AGENTS.notifSeen;

  return `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <h1 class="page-title">Agents</h1>
        <p class="page-sub">AI that works for you — on autopilot.</p>
      </div>
      ${agents.length ? `
        <div style="position:relative;">
          <button class="agent-notif-bell" onclick="toggleNotifPanel()">
            ACTIVITY ${notifUnseen > 0 ? `<span class="agent-notif-badge">${notifUnseen}</span>` : ''}
          </button>
          ${AGENTS.notifOpen ? renderNotifPanel() : ''}
        </div>
      ` : ''}
    </div>

    ${renderRecipeGrid()}

    ${agents.length ? `
      <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--text-muted);padding-bottom:10px;margin-bottom:16px;border-bottom:1px solid var(--border);">Your Agents</div>
      <div class="agents-grid">
        ${agents.map(a => renderAgentCard(a)).join('')}
      </div>
    ` : `
      <div class="agent-empty-note">Pick a recipe above to create your first agent.</div>
    `}
  `;
}

// ─── Notif Toggle (needs global scope for inline onclick) ───

export function toggleNotifPanel() {
  AGENTS.notifOpen = !AGENTS.notifOpen;
  if (!AGENTS.notifOpen) AGENTS.notifSeen = AGENTS.notifications.length;
  render();
}

// ─── Window Assignments ───

window.agentAction = agentAction;
window.selectAgent = selectAgent;
window.openRecipeSetup = openRecipeSetup;
window.closeRecipeSetup = closeRecipeSetup;
window.activateRecipe = activateRecipe;
window.setRecipeSchedule = setRecipeSchedule;
window.setAgentCategory = setAgentCategory;
window.toggleNotifPanel = toggleNotifPanel;
window.loadAgentTemplates = loadAgentTemplates;
window.loadMyAgents = loadMyAgents;
window.startAgentPolling = startAgentPolling;
window.stopAgentPolling = stopAgentPolling;
