// ═══════════════════════════════════════════
// INFINITE Dashboard — Tab: My Agents (ES Module)
// ═══════════════════════════════════════════

import { STATE, AGENTS } from '../state.js';
import { api, escapeHtml } from '../api.js';
import { timeAgo } from '../utils.js';
import { render } from '../render.js';
import { showToast } from '../actions.js';

// ─── Constants ───

export const AGENT_ICON_LETTER = {'wallet-monitor':'W','trading-agent':'T','personal-assistant':'A','custom':'C'};
export const CRON_LABELS = {'*/5 * * * *':'Every 5m','*/10 * * * *':'Every 10m','*/30 * * * *':'Every 30m','0 * * * *':'Hourly','0 */2 * * *':'Every 2h','0 */6 * * *':'Every 6h','0 9 * * *':'Daily 9AM','0 9,21 * * *':'Twice daily'};

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

// ─── Agent Actions ───

export async function createAgent() {
  if (!AGENTS.wizardTemplate) return;
  AGENTS.loading = true;
  render();

  try {
    const config = { ...AGENTS.wizardConfig };
    const tmpl = AGENTS.templates.find(t => t.id === AGENTS.wizardTemplate);

    const body = {
      template: AGENTS.wizardTemplate,
      name: config.agentName || tmpl?.name || 'My Agent',
      model: config.model || tmpl?.defaultModel || 'gemini-2.5-flash',
      schedule: config.schedule || tmpl?.defaultSchedule || '0 */6 * * *',
      config,
    };

    const data = await api('/v1/agents', { method: 'POST', body: JSON.stringify(body) });

    if (data.ok) {
      showToast('Agent created!');
      AGENTS.wizardStep = 0;
      AGENTS.wizardTemplate = null;
      AGENTS.wizardConfig = {};
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

export async function agentAction(agentId, action) {
  try {
    if (action === 'delete') {
      if (!confirm('Delete this agent? This cannot be undone.')) return;
      await api(`/v1/agents/${agentId}`, { method: 'DELETE' });
      showToast('Agent deleted');
      AGENTS.selectedAgent = null;
    } else if (action === 'activate') {
      await api(`/v1/agents/${agentId}/activate`, { method: 'POST' });
      showToast('Agent activated — it will run on schedule');
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
          pushAgentNotification(agentId, 'run_complete', 'Run completed successfully');
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

export async function viewAgentLogs(agentId) {
  AGENTS.selectedAgent = agentId;
  render();
}

export function collectWizardConfig() {
  const selectedTmpl = AGENTS.templates.find(t => t.id === AGENTS.wizardTemplate);
  if (!selectedTmpl) return;

  const nameEl = document.getElementById('agentWizName');
  const modelEl = document.getElementById('agentWizModel');
  const schedEl = document.getElementById('agentWizSchedule');

  AGENTS.wizardConfig.agentName = nameEl?.value || selectedTmpl.name;
  AGENTS.wizardConfig.model = modelEl?.value || selectedTmpl.defaultModel;
  AGENTS.wizardConfig.schedule = schedEl?.value || selectedTmpl.defaultSchedule;

  for (const f of (selectedTmpl.configFields || [])) {
    const el = document.getElementById(`agentWiz_${f.id}`);
    if (el) AGENTS.wizardConfig[f.id] = el.value;
  }
}

// ─── Polling ───

export function startAgentPolling() {
  if (AGENTS.pollInterval) return;
  AGENTS.pollInterval = setInterval(async () => {
    if (STATE.currentTab !== 'my-agents') {
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

// ─── Internal Helpers ───

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

function renderNotifPanel() {
  const items = AGENTS.notifications.slice(0, 20);
  if (!items.length) {
    return `<div class="agent-notif-panel">
      <div class="agent-notif-panel-header">Notifications</div>
      <div style="padding:24px;text-align:center;color:var(--text-muted);font-family:var(--font-mono);font-size:11px;">No notifications yet. Run an agent to see activity here.</div>
    </div>`;
  }
  return `<div class="agent-notif-panel">
    <div class="agent-notif-panel-header">Notifications</div>
    ${items.map(n => `
      <div class="agent-notif-item" onclick="viewAgentLogs('${n.agentId}');AGENTS.notifOpen=false;render();">
        <div class="agent-notif-dot ${n.type}"></div>
        <div class="agent-notif-body">
          <div class="agent-notif-text"><strong>${escapeHtml(n.agentName)}</strong> ${escapeHtml(n.message || n.type.replace(/_/g, ' '))}</div>
          <div class="agent-notif-time">${timeAgo(n.ts)}</div>
        </div>
      </div>
    `).join('')}
  </div>`;
}

function renderActivityItem(a) {
  const letter = AGENT_ICON_LETTER[a.template] || 'A';
  const typeLabels = {
    run_start: 'Started',
    run_complete: 'Completed',
    run_error: 'Error',
    created: 'Created',
    activated: 'Activated',
    paused: 'Paused',
    updated: 'Updated',
  };
  const dotColor = a.type === 'run_complete' ? 'var(--green)' : a.type === 'run_error' ? 'var(--red)' : a.type === 'run_start' ? 'var(--accent)' : 'var(--text-muted)';
  return `
    <div class="agent-activity-item" style="cursor:pointer;" onclick="viewAgentLogs('${a.agentId}')">
      <div class="agent-activity-icon" style="border-color:${dotColor};color:${dotColor};">${letter}</div>
      <div class="agent-activity-body">
        <div class="agent-activity-title">${escapeHtml(a.agentName || 'Agent')} — ${typeLabels[a.type] || a.type}</div>
        ${a.message ? `<div class="agent-activity-desc">${escapeHtml(a.message)}</div>` : ''}
      </div>
      <div class="agent-activity-time">${timeAgo(a.ts)}</div>
    </div>
  `;
}

function renderAgentCard(a) {
  const iconLetter = AGENT_ICON_LETTER[a.template] || 'A';
  const shortModel = (a.model || 'unknown').replace('claude-','').replace('gemini-','').split('-').slice(0,2).join('-');
  const scheduleLabel = CRON_LABELS[a.schedule] || a.schedule || 'manual';
  const isRunning = AGENTS.runningAgents.has(a.id);
  const isActive = a.status === 'active';

  return `
    <div class="agent-card" style="${isActive ? 'border-color: rgba(76,217,100,0.3);' : ''}">
      <div class="agent-card-header">
        <div class="agent-card-icon" style="${isActive ? 'border-color:var(--green);color:var(--green);' : ''}">${iconLetter}</div>
        <div class="agent-card-info">
          <div class="agent-card-name" style="display:flex;align-items:center;gap:8px;">
            ${escapeHtml(a.name)}
            ${isActive ? '<span class="agent-pulse"></span>' : ''}
            ${isRunning ? '<span class="agent-running-indicator"></span>' : ''}
          </div>
          <div class="agent-card-meta">${shortModel} // ${scheduleLabel}</div>
        </div>
        <span class="agent-status-badge ${a.status}">${a.status.toUpperCase()}</span>
      </div>
      <div class="agent-card-stats">
        <span>Runs: <strong>${a.runCount || 0}</strong></span>
        <span>Tokens: <strong>${(a.totalTokens || 0).toLocaleString()}</strong></span>
        <span>Last: <strong>${a.lastRun ? timeAgo(a.lastRun) : 'never'}</strong></span>
      </div>
      ${a.lastResult ? `<div class="agent-card-result">${escapeHtml(a.lastResult.slice(0, 200))}${a.lastResult.length > 200 ? '...' : ''}</div>` : ''}
      ${a.lastError ? `<div class="agent-card-result" style="border-color:var(--red);color:var(--red);">${escapeHtml(a.lastError)}</div>` : ''}
      <div class="agent-card-actions">
        ${a.status === 'paused'
          ? `<button class="btn-sm accent" onclick="agentAction('${a.id}','activate')">Activate</button>`
          : `<button class="btn-sm" onclick="agentAction('${a.id}','pause')">Pause</button>`}
        <button class="btn-sm" ${isRunning ? 'disabled style="opacity:0.5;"' : ''} onclick="agentAction('${a.id}','run')">${isRunning ? 'Running...' : 'Run Now'}</button>
        <button class="btn-sm" onclick="viewAgentLogs('${a.id}')">Logs</button>
        <button class="btn-sm danger" onclick="agentAction('${a.id}','delete')">Delete</button>
      </div>
    </div>
  `;
}

function renderAgentStatsBar(agents) {
  const totalRuns = agents.reduce((s, a) => s + (a.runCount || 0), 0);
  const totalTokens = agents.reduce((s, a) => s + (a.totalTokens || 0), 0);
  const activeCount = agents.filter(a => a.status === 'active').length;

  return `
    <div class="agent-stats-bar">
      <div class="agent-stat-item">
        <div class="agent-stat-value">${agents.length}</div>
        <div class="agent-stat-label">Total Agents</div>
      </div>
      <div class="agent-stat-item">
        <div class="agent-stat-value green">${activeCount}</div>
        <div class="agent-stat-label">Active</div>
      </div>
      <div class="agent-stat-item">
        <div class="agent-stat-value">${totalRuns}</div>
        <div class="agent-stat-label">Total Runs</div>
      </div>
      <div class="agent-stat-item">
        <div class="agent-stat-value accent">${totalTokens.toLocaleString()}</div>
        <div class="agent-stat-label">Tokens Used</div>
      </div>
    </div>
  `;
}

function renderAgentWizard() {
  const step = AGENTS.wizardStep;
  const templates = AGENTS.templates;
  const selectedTmpl = templates.find(t => t.id === AGENTS.wizardTemplate);

  if (step === 1) {
    return `
      <div class="agent-wizard">
        <div class="agent-wizard-step">
          <div class="agent-wizard-step-label">Step 1 of 3</div>
          <div class="agent-wizard-step-title">What do you want this agent to do?</div>
          <div class="agent-wizard-step-sub">Choose a template to get started. You can customize everything in the next step.</div>
        </div>
        <div class="agents-grid">
          ${templates.map(t => `
            <div class="agent-template-card ${AGENTS.wizardTemplate === t.id ? 'selected' : ''}"
                 onclick="AGENTS.wizardTemplate='${t.id}';render();">
              <div class="agent-template-icon">${t.icon}</div>
              <div class="agent-template-name">${t.name}</div>
              <div class="agent-template-desc">${t.description}</div>
            </div>
          `).join('')}
        </div>
        <div class="agent-wizard-actions">
          <button class="btn-sm" onclick="AGENTS.wizardStep=0;AGENTS.wizardTemplate=null;AGENTS.wizardConfig={};render();">Cancel</button>
          <button class="btn-sm accent" ${!AGENTS.wizardTemplate ? 'disabled' : ''} onclick="AGENTS.wizardStep=2;render();">Next \u2192</button>
        </div>
      </div>
    `;
  }

  if (step === 2 && selectedTmpl) {
    const scheduleOptions = [
      { value: '*/5 * * * *', label: 'Every 5 minutes' },
      { value: '*/10 * * * *', label: 'Every 10 minutes' },
      { value: '*/30 * * * *', label: 'Every 30 minutes' },
      { value: '0 * * * *', label: 'Every hour' },
      { value: '0 */2 * * *', label: 'Every 2 hours' },
      { value: '0 */6 * * *', label: 'Every 6 hours' },
      { value: '0 9 * * *', label: 'Daily at 9 AM UTC' },
      { value: '0 9,21 * * *', label: 'Twice daily (9 AM / 9 PM UTC)' },
    ];

    const modelChoices = STATE.models.length ? STATE.models : ['gemini-2.5-flash', 'gemini-2.5-pro', 'claude-sonnet-4-5-20250929'];

    const config = AGENTS.wizardConfig;

    return `
      <div class="agent-wizard">
        <div class="agent-wizard-step">
          <div class="agent-wizard-step-label">Step 2 of 3</div>
          <div class="agent-wizard-step-title">Configure ${selectedTmpl.name}</div>
          <div class="agent-wizard-step-sub">Customize your agent's behavior.</div>
        </div>
        <div class="agent-field">
          <label>Agent Name</label>
          <input type="text" id="agentWizName" placeholder="${selectedTmpl.name}" value="${escapeHtml(config.agentName || '')}">
        </div>
        <div class="agent-field">
          <label>AI Model</label>
          <select id="agentWizModel">
            ${modelChoices.map(m => `<option value="${m}" ${(config.model || selectedTmpl.defaultModel) === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="agent-field">
          <label>Run Schedule</label>
          <select id="agentWizSchedule">
            ${scheduleOptions.map(s => `<option value="${s.value}" ${(config.schedule || selectedTmpl.defaultSchedule) === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
        </div>
        ${(selectedTmpl.configFields || []).map(f => `
          <div class="agent-field">
            <label>${f.label}</label>
            ${f.type === 'textarea' ? `
              <textarea id="agentWiz_${f.id}" placeholder="${f.placeholder || ''}">${escapeHtml(config[f.id] || f.default || '')}</textarea>
            ` : f.type === 'select' ? `
              <select id="agentWiz_${f.id}">
                ${f.options.map(o => `<option value="${o}" ${config[f.id] === o ? 'selected' : ''}>${o}</option>`).join('')}
              </select>
            ` : `
              <input type="${f.type || 'text'}" id="agentWiz_${f.id}" placeholder="${f.placeholder || ''}" value="${escapeHtml(config[f.id] || f.default || '')}">
            `}
          </div>
        `).join('')}
        <div class="agent-wizard-actions">
          <button class="btn-sm" onclick="AGENTS.wizardStep=1;render();">\u2190 Back</button>
          <button class="btn-sm accent" onclick="collectWizardConfig();AGENTS.wizardStep=3;render();">Next \u2192</button>
        </div>
      </div>
    `;
  }

  if (step === 3 && selectedTmpl) {
    const config = AGENTS.wizardConfig;
    return `
      <div class="agent-wizard">
        <div class="agent-wizard-step">
          <div class="agent-wizard-step-label">Step 3 of 3</div>
          <div class="agent-wizard-step-title">Ready to deploy</div>
          <div class="agent-wizard-step-sub">Review your agent and activate it.</div>
        </div>
        <div class="api-key-box" style="margin-bottom:24px;">
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
            <span style="font-family:var(--font-mono);font-size:22px;font-weight:700;color:var(--accent);border:2px solid var(--accent);width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;">${selectedTmpl.icon}</span>
            <div>
              <div style="font-family:var(--font-mono);font-size:16px;font-weight:600;">${escapeHtml(config.agentName || selectedTmpl.name)}</div>
              <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">${config.model || selectedTmpl.defaultModel} \u2022 ${config.schedule || selectedTmpl.defaultSchedule}</div>
            </div>
          </div>
          <div class="api-key-hint" style="line-height:2;">
            <strong style="color:var(--text);">Template:</strong> ${selectedTmpl.name}<br>
            <strong style="color:var(--text);">Tools:</strong> ${(selectedTmpl.tools || []).join(', ')}<br>
            <strong style="color:var(--text);">Billing:</strong> Uses your API quota (counted against daily limit)<br>
            <strong style="color:var(--text);">Status:</strong> Will start <em>paused</em> — activate when ready
          </div>
        </div>
        <div class="agent-wizard-actions">
          <button class="btn-sm" onclick="AGENTS.wizardStep=2;render();">\u2190 Back</button>
          <button class="btn-sm accent" ${AGENTS.loading ? 'disabled' : ''} onclick="createAgent();">${AGENTS.loading ? 'Deploying...' : 'Deploy Agent'}</button>
        </div>
      </div>
    `;
  }

  // Fallback
  AGENTS.wizardStep = 0;
  return renderMyAgents();
}

function renderAgentDetail() {
  const agent = AGENTS.list.find(a => a.id === AGENTS.selectedAgent);
  if (!agent) {
    AGENTS.selectedAgent = null;
    return renderMyAgents();
  }

  const logsContainerId = 'agentLogsContainer';
  setTimeout(async () => {
    try {
      const data = await api(`/v1/agents/${agent.id}/logs`);
      const container = document.getElementById(logsContainerId);
      if (!container) return;
      const logs = data.logs || [];
      if (!logs.length) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:16px;">No logs yet. Run the agent to generate activity.</div>';
        return;
      }
      container.innerHTML = logs.map(l => `
        <div class="agent-log-entry">
          <span class="agent-log-ts">${new Date(l.ts).toLocaleString()}</span>
          <span class="agent-log-type ${l.type}">${l.type.replace('_', ' ')}</span>
          <span class="agent-log-msg">${escapeHtml(l.message || '')}</span>
        </div>
      `).join('');
    } catch {}
  }, 100);

  const lastRun = agent.lastRun ? new Date(agent.lastRun).toLocaleString() : 'Never';
  return `
    <div style="margin-bottom:24px;">
      <button class="btn-sm" onclick="AGENTS.selectedAgent=null;render();">\u2190 Back to Agents</button>
    </div>
    <div class="page-header">
      <h1 class="page-title" style="display:flex;align-items:center;gap:14px;">
        <span style="font-family:var(--font-mono);font-size:22px;font-weight:700;color:var(--accent);border:2px solid var(--accent);width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;">${AGENT_ICON_LETTER[agent.template] || 'A'}</span> ${escapeHtml(agent.name)}
        <span class="agent-status-badge ${agent.status}" style="font-size:11px;">${agent.status.toUpperCase()}</span>
      </h1>
      <p class="page-sub">${agent.template} // ${agent.model} // ${CRON_LABELS[agent.schedule] || agent.schedule}</p>
    </div>
    <div class="stats-row">
      <div class="stat-card"><div class="label">Total Runs</div><div class="value">${agent.runCount || 0}</div></div>
      <div class="stat-card"><div class="label">Tokens Used</div><div class="value">${(agent.totalTokens || 0).toLocaleString()}</div></div>
      <div class="stat-card"><div class="label">Last Run</div><div class="value" style="font-size:14px;">${lastRun}</div></div>
      <div class="stat-card"><div class="label">Status</div><div class="value ${agent.status === 'active' ? 'green' : ''}">${agent.status.toUpperCase()}</div></div>
    </div>
    ${agent.lastResult ? `
      <div class="section">
        <div class="section-title">Last Result</div>
        <div class="agent-card-result" style="max-height:300px;">${escapeHtml(agent.lastResult)}</div>
      </div>
    ` : ''}
    <div style="display:flex;gap:8px;margin:20px 0;">
      ${agent.status === 'paused'
        ? `<button class="btn-sm accent" onclick="agentAction('${agent.id}','activate')">Activate</button>`
        : `<button class="btn-sm" onclick="agentAction('${agent.id}','pause')">Pause</button>`}
      <button class="btn-sm" onclick="agentAction('${agent.id}','run')">Run Now</button>
      <button class="btn-sm danger" onclick="agentAction('${agent.id}','delete')">Delete Agent</button>
    </div>
    <div class="section">
      <div class="section-title">Activity Log</div>
      <div class="agent-logs" id="${logsContainerId}">
        <div style="color:var(--text-muted);font-size:12px;padding:16px;">Loading logs...</div>
      </div>
    </div>
  `;
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

  if (AGENTS.wizardStep > 0) {
    return renderAgentWizard();
  }

  if (AGENTS.selectedAgent) {
    return renderAgentDetail();
  }

  const agents = AGENTS.list;
  const notifUnseen = AGENTS.notifications.length - AGENTS.notifSeen;

  if (!agents.length) {
    return `
      <div class="page-header">
        <h1 class="page-title">AI Agents</h1>
        <p class="page-sub">Deploy autonomous AI agents that run 24/7 on your schedule. Uses your API quota.</p>
      </div>
      <div class="agent-empty">
        <div class="agent-empty-icon" style="font-family:var(--font-mono);font-weight:700;">INF</div>
        <div class="agent-empty-title">No agents yet</div>
        <div class="agent-empty-sub">Deploy your first autonomous agent. It runs on a schedule using your API quota — wallet monitors, trading alerts, personal assistants, or fully custom.</div>
        <button class="btn accent" onclick="AGENTS.wizardStep=1;render();">Activate Agent</button>
      </div>
    `;
  }

  return `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <h1 class="page-title">AI Agents</h1>
        <p class="page-sub">Deploy autonomous AI agents that run 24/7 on your schedule.</p>
      </div>
      <div style="display:flex;gap:10px;align-items:center;">
        <div style="position:relative;">
          <button class="agent-notif-bell" onclick="AGENTS.notifOpen=!AGENTS.notifOpen;if(!AGENTS.notifOpen)AGENTS.notifSeen=AGENTS.notifications.length;render();">
            ACTIVITY ${notifUnseen > 0 ? `<span class="agent-notif-badge">${notifUnseen}</span>` : ''}
          </button>
          ${AGENTS.notifOpen ? renderNotifPanel() : ''}
        </div>
        <button class="btn-sm accent" onclick="AGENTS.wizardStep=1;render();">+ New Agent</button>
      </div>
    </div>

    ${renderAgentStatsBar(agents)}

    <div class="section-title" style="margin-bottom:16px;">Your Agents</div>
    <div class="agents-grid">
      ${agents.map(a => renderAgentCard(a)).join('')}
    </div>

    ${AGENTS.activity.length ? `
      <div class="agent-activity-section">
        <div class="section-title" style="margin-bottom:16px;">Recent Activity</div>
        ${AGENTS.activity.slice(0, 10).map(a => renderActivityItem(a)).join('')}
      </div>
    ` : ''}
  `;
}

// ─── Window Assignments (for onclick handlers in HTML templates) ───

window.agentAction = agentAction;
window.viewAgentLogs = viewAgentLogs;
window.createAgent = createAgent;
window.collectWizardConfig = collectWizardConfig;
window.loadAgentTemplates = loadAgentTemplates;
window.loadMyAgents = loadMyAgents;
window.startAgentPolling = startAgentPolling;
window.stopAgentPolling = stopAgentPolling;
