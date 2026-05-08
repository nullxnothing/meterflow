// ═══════════════════════════════════════════
// Meterflow Dashboard — Agent View Renderers
// Recipe-based UX
// ═══════════════════════════════════════════

import { AGENTS } from '../state.js';
import { api } from '../api.js';
import { escapeHtml } from '../utils.js';
import { timeAgo } from '../utils.js';


// ─── Cron → Human Labels ───

const CRON_HUMAN = {
  '*/5 * * * *': 'Checking every 5 min',
  '*/10 * * * *': 'Checking every 10 min',
  '*/30 * * * *': 'Checking every 30 min',
  '0 * * * *': 'Checking every hour',
  '0 */2 * * *': 'Checking every 2 hours',
  '0 */6 * * *': 'Checking every 6 hours',
  '0 */12 * * *': 'Checking twice daily',
  '0 9 * * *': 'Runs daily at 9AM',
  '0 9 * * 1-5': 'Runs weekdays at 9AM',
  '0 9,18 * * *': 'Runs morning & evening',
  '0 9,21 * * *': 'Runs twice daily',
  '0 9 * * 1': 'Runs weekly on Monday',
  '0 9 * * 1,4': 'Runs Mon & Thu',
  'manual': 'On demand',
};

function humanSchedule(schedule) {
  return CRON_HUMAN[schedule] || schedule || 'On demand';
}

function firstSentence(text) {
  if (!text) return '';
  const cleaned = text.replace(/^[\s\n*#-]+/, '').trim();
  const match = cleaned.match(/^[^.!?\n]+[.!?]?/);
  return match ? match[0].trim() : cleaned.slice(0, 120);
}

// ─── Category Labels ───

const CATEGORIES = [
  { id: 'on-chain', label: 'On-Chain' },
  { id: 'content', label: 'Content' },
  { id: 'research', label: 'Research' },
  { id: 'productivity', label: 'Productivity' },
];

// ─── Notification Panel ───

export function renderNotifPanel() {
  const items = AGENTS.notifications.slice(0, 20);
  if (!items.length) {
    return `<div class="agent-notif-panel">
      <div class="agent-notif-panel-header">Notifications</div>
      <div style="padding:24px;text-align:center;color:var(--text-muted);font-family:var(--font-mono);font-size:11px;">No notifications yet.</div>
    </div>`;
  }
  return `<div class="agent-notif-panel">
    <div class="agent-notif-panel-header">Notifications</div>
    ${items.map(n => `
      <div class="agent-notif-item" onclick="selectAgent('${n.agentId}')">
        <div class="agent-notif-dot ${n.type}"></div>
        <div class="agent-notif-body">
          <div class="agent-notif-text"><strong>${escapeHtml(n.agentName)}</strong> ${escapeHtml(n.message || n.type.replace(/_/g, ' '))}</div>
          <div class="agent-notif-time">${timeAgo(n.ts)}</div>
        </div>
      </div>
    `).join('')}
  </div>`;
}

// ─── Recipe Category Tabs ───

export function renderRecipeTabs() {
  return `<div class="recipe-tabs">
    ${CATEGORIES.map(c => `
      <button class="recipe-tab ${AGENTS.activeCategory === c.id ? 'active' : ''}"
              onclick="setAgentCategory('${c.id}')">${c.label}</button>
    `).join('')}
  </div>`;
}

// ─── Recipe Grid ───

export function renderRecipeGrid() {
  const templates = AGENTS.templates.filter(t => t.category === AGENTS.activeCategory);
  const customTmpl = AGENTS.templates.find(t => t.id === 'custom');

  return `
    ${renderRecipeTabs()}
    <div class="recipe-grid">
      ${templates.map(t => `
        <div class="recipe-card" onclick="openRecipeSetup('${t.id}')">
          <div class="recipe-card-name">${escapeHtml(t.name)}</div>
          <div class="recipe-card-desc">${escapeHtml(t.description)}</div>
          <div class="recipe-card-hint">${escapeHtml(t.scheduleLabel || 'On demand')}</div>
        </div>
      `).join('')}
      ${AGENTS.activeCategory !== 'custom' && customTmpl ? `
        <div class="recipe-card" onclick="openRecipeSetup('custom')" style="border-style:dashed;">
          <div class="recipe-card-name">${escapeHtml(customTmpl.name)}</div>
          <div class="recipe-card-desc">${escapeHtml(customTmpl.description)}</div>
          <div class="recipe-card-hint">Any schedule</div>
        </div>
      ` : ''}
    </div>
  `;
}

// ─── Inline Setup Panel ───

export function renderRecipeSetup() {
  const tmpl = AGENTS.templates.find(t => t.id === AGENTS.setupRecipe);
  if (!tmpl) return '';

  const config = AGENTS.setupConfig;
  const hasScheduleOptions = tmpl.scheduleOptions && tmpl.scheduleOptions.length > 0;

  return `
    <div class="recipe-setup">
      <div class="recipe-setup-header">
        <button class="recipe-setup-back" onclick="closeRecipeSetup()">&larr; Back</button>
        <div class="recipe-setup-title">${escapeHtml(tmpl.name)}</div>
        <div class="recipe-setup-sub">${escapeHtml(tmpl.description)}</div>
      </div>

      ${(tmpl.configFields || []).map(f => `
        <div class="recipe-field">
          <label>${escapeHtml(f.label)}</label>
          ${f.type === 'textarea' ? `
            <textarea id="recipeField_${f.id}" placeholder="${escapeHtml(f.placeholder || '')}">${escapeHtml(config[f.id] || f.default || '')}</textarea>
          ` : f.type === 'select' ? `
            <select id="recipeField_${f.id}">
              ${f.options.map(o => `<option value="${escapeHtml(o)}" ${config[f.id] === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}
            </select>
          ` : `
            <input type="${f.type || 'text'}" id="recipeField_${f.id}" placeholder="${escapeHtml(f.placeholder || '')}" value="${escapeHtml(config[f.id] || f.default || '')}">
          `}
        </div>
      `).join('')}

      ${hasScheduleOptions ? `
        <div class="recipe-field">
          <label>How often</label>
          <div class="recipe-frequency">
            ${tmpl.scheduleOptions.map(s => `
              <label class="recipe-freq-option ${(config.schedule || tmpl.defaultSchedule) === s.value ? 'active' : ''}"
                     onclick="setRecipeSchedule('${s.value}')">
                <input type="radio" name="recipeSchedule" value="${s.value}" ${(config.schedule || tmpl.defaultSchedule) === s.value ? 'checked' : ''}>
                <span class="recipe-freq-dot"></span>
                ${escapeHtml(s.label)}
              </label>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="recipe-setup-actions">
        <button class="btn-sm" onclick="closeRecipeSetup()">Cancel</button>
        <button class="btn-sm accent" ${AGENTS.loading ? 'disabled' : ''} onclick="activateRecipe()">
          ${AGENTS.loading ? 'Activating...' : 'Activate'}
        </button>
      </div>
    </div>
  `;
}

// ─── Redesigned Agent Card ───

export function renderAgentCard(a) {
  const isRunning = AGENTS.runningAgents.has(a.id);
  const isActive = a.status === 'active';
  const schedule = humanSchedule(a.schedule);
  const finding = a.lastError
    ? a.lastError
    : a.lastResult
      ? firstSentence(a.lastResult)
      : null;
  const hasError = !!a.lastError;

  return `
    <div class="agent-card" onclick="selectAgent('${a.id}')">
      <div class="agent-card-top">
        <div class="agent-card-name">
          ${escapeHtml(a.name)}
          ${isRunning ? ' <span class="agent-running-indicator"></span>' : ''}
        </div>
        <div class="agent-card-status ${a.status}">
          <span class="agent-status-dot ${a.status}"></span>
          ${isActive ? 'Active' : 'Paused'}
        </div>
      </div>
      <div class="agent-card-schedule">${schedule}</div>
      ${a.lastRun ? `<div class="agent-card-last">Last check: ${timeAgo(a.lastRun)}</div>` : ''}
      ${finding ? `<div class="agent-finding ${hasError ? 'error' : ''}">${escapeHtml(finding)}</div>` : ''}
      <div class="agent-card-actions" onclick="event.stopPropagation();">
        ${isActive
          ? `<button class="btn-sm" onclick="agentAction('${a.id}','pause')">Pause</button>`
          : `<button class="btn-sm accent" onclick="agentAction('${a.id}','activate')">Activate</button>`}
        <button class="btn-sm" ${isRunning ? 'disabled style="opacity:0.5;"' : ''} onclick="agentAction('${a.id}','run')">
          ${isRunning ? 'Running...' : 'Run Now'}
        </button>
      </div>
    </div>
  `;
}

// ─── Agent Detail View ───

export function renderAgentDetail() {
  const agent = AGENTS.list.find(a => a.id === AGENTS.selectedAgent);
  if (!agent) {
    AGENTS.selectedAgent = null;
    return '';
  }

  const isActive = agent.status === 'active';
  const isRunning = AGENTS.runningAgents.has(agent.id);
  const schedule = humanSchedule(agent.schedule);
  const logsId = 'agentDetailLogs';

  // Async load logs into container
  setTimeout(async () => {
    try {
      const data = await api(`/v1/agents/${agent.id}/logs`);
      const container = document.getElementById(logsId);
      if (!container) return;
      const logs = (data.logs || []).filter(l => l.type === 'run_complete' || l.type === 'run_error');
      if (!logs.length) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:11px;font-family:var(--font-mono);padding:12px 0;">No runs yet. Click "Run Now" to see results.</div>';
        return;
      }
      container.innerHTML = logs.slice(0, 20).map(l => {
        const isError = l.type === 'run_error';
        const icon = isError ? '!' : '\u2713';
        const iconClass = isError ? 'error' : (l.message && l.message.includes('!') ? 'notable' : 'ok');
        return `
          <div class="agent-history-item">
            <div class="agent-history-time">${timeAgo(l.ts)}</div>
            <div class="agent-history-icon ${iconClass}">${icon}</div>
            <div class="agent-history-msg">${escapeHtml(firstSentence(l.message || ''))}</div>
          </div>
        `;
      }).join('');
    } catch {}
  }, 50);

  // Config display
  const configEntries = Object.entries(agent.config || {}).filter(
    ([k]) => !['systemPrompt', 'taskPrompt', 'agentName', 'model', 'schedule'].includes(k)
  );

  const createdAgo = agent.createdAt ? timeAgo(agent.createdAt) : 'unknown';

  return `
    <div class="agent-detail">
      <button class="agent-detail-back" onclick="selectAgent(null)">&larr; Back to Agents</button>

      <div class="agent-detail-header">
        <div class="agent-detail-title">
          ${escapeHtml(agent.name)}
          <span class="agent-card-status ${agent.status}">
            <span class="agent-status-dot ${agent.status}"></span>
            ${isActive ? 'Active' : 'Paused'}
          </span>
          ${isRunning ? '<span class="agent-running-indicator"></span>' : ''}
        </div>
        <div class="agent-detail-schedule">${schedule}</div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:8px;">
        ${isActive
          ? `<button class="btn-sm" onclick="agentAction('${agent.id}','pause')">Pause</button>`
          : `<button class="btn-sm accent" onclick="agentAction('${agent.id}','activate')">Activate</button>`}
        <button class="btn-sm" ${isRunning ? 'disabled style="opacity:0.5;"' : ''} onclick="agentAction('${agent.id}','run')">
          ${isRunning ? 'Running...' : 'Run Now'}
        </button>
      </div>

      ${agent.lastResult ? `
        <div class="agent-section-label">Latest Finding</div>
        <div class="agent-detail-finding">${escapeHtml(agent.lastResult)}</div>
      ` : ''}

      ${agent.lastError ? `
        <div class="agent-section-label">Last Error</div>
        <div class="agent-detail-finding" style="border-color:rgba(255,95,87,0.3);color:var(--red);">${escapeHtml(agent.lastError)}</div>
      ` : ''}

      <div class="agent-section-label">History</div>
      <div id="${logsId}">
        <div style="color:var(--text-muted);font-size:11px;font-family:var(--font-mono);padding:12px 0;">Loading...</div>
      </div>

      ${configEntries.length ? `
        <div class="agent-section-label">Settings</div>
        ${configEntries.map(([k, v]) => `
          <div class="agent-settings-row">
            <span class="label">${escapeHtml(k)}</span>
            <span class="value">${escapeHtml(String(v).slice(0, 80))}${String(v).length > 80 ? '...' : ''}</span>
          </div>
        `).join('')}
      ` : ''}

      <div class="agent-meta-line">
        ${agent.runCount || 0} runs &middot; ${(agent.totalTokens || 0).toLocaleString()} tokens used &middot; Created ${createdAgo}
      </div>

      <div class="agent-detail-delete">
        <button class="btn-sm danger" onclick="agentAction('${agent.id}','delete')">Delete Agent</button>
      </div>
    </div>
  `;
}
