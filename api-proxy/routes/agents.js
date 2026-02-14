import { Router } from 'express';
import crypto from 'crypto';
import { authenticateApiKey } from '../middleware.js';
import { saveAgent, getAgent, listAgents, deleteAgent, appendAgentLog, getAgentLogs } from '../lib/kv-agents.js';
import { AGENT_TEMPLATES, executeAgentRun, scheduleAgent, unscheduleAgent } from '../agent-scheduler.js';

const router = Router();

// GET /v1/agents/templates — list available agent templates
router.get('/agents/templates', authenticateApiKey, (req, res) => {
  const templates = Object.entries(AGENT_TEMPLATES).map(([id, t]) => ({
    id,
    name: t.name,
    description: t.description,
    icon: t.icon,
    defaultModel: t.defaultModel,
    defaultSchedule: t.defaultSchedule,
    configFields: t.configFields,
    tools: t.tools,
  }));
  res.json({ templates });
});

// GET /v1/agents — list user's agents
router.get('/agents', authenticateApiKey, async (req, res) => {
  try {
    const agents = await listAgents(req.infinite.apiKey);
    // Strip sensitive fields
    const safe = agents.map(a => ({
      id: a.id,
      name: a.name,
      template: a.template,
      icon: a.icon,
      model: a.model,
      schedule: a.schedule,
      status: a.status,
      lastRun: a.lastRun,
      lastResult: a.lastResult,
      lastError: a.lastError,
      runCount: a.runCount || 0,
      totalTokens: a.totalTokens || 0,
      createdAt: a.createdAt,
      config: a.config || {},
    }));
    res.json({ agents: safe });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list agents', detail: err.message });
  }
});

// POST /v1/agents — create a new agent
router.post('/agents', authenticateApiKey, async (req, res) => {
  const { template, name, model, schedule, config } = req.body;
  const { apiKey, tierConfig } = req.infinite;

  if (!template || !AGENT_TEMPLATES[template]) {
    return res.status(400).json({ error: 'Invalid template', validTemplates: Object.keys(AGENT_TEMPLATES) });
  }

  // Check agent limit by tier
  const existing = await listAgents(apiKey);
  const limits = { signal: 1, operator: 3, architect: 10 };
  const tierName = Object.keys(limits).find(t => tierConfig.label.toLowerCase() === t) || 'signal';
  if (existing.length >= (limits[tierName] || 1)) {
    return res.status(403).json({
      error: 'agent_limit_reached',
      message: `${tierConfig.label} tier allows ${limits[tierName] || 1} agent(s). Upgrade to create more.`,
      limit: limits[tierName] || 1,
      current: existing.length,
    });
  }

  const tmpl = AGENT_TEMPLATES[template];
  const agentId = `agt_${crypto.randomBytes(8).toString('hex')}`;

  // Build system prompt
  let systemPrompt = tmpl.systemPrompt;
  if (template === 'custom' && config?.systemPrompt) {
    systemPrompt = config.systemPrompt;
  }

  const agent = {
    id: agentId,
    apiKey,
    template,
    name: name || tmpl.name,
    icon: tmpl.icon,
    model: model || tmpl.defaultModel,
    schedule: schedule || tmpl.defaultSchedule,
    systemPrompt,
    taskPrompt: config?.taskPrompt || config?.tasks || null,
    tools: tmpl.tools,
    config: config || {},
    status: 'paused', // start paused — user activates
    createdAt: Date.now(),
    lastRun: null,
    lastResult: null,
    lastError: null,
    runCount: 0,
    totalTokens: 0,
  };

  try {
    await saveAgent(agentId, agent);
    await appendAgentLog(agentId, { type: 'created', message: `Agent created from template: ${template}` });

    res.json({
      ok: true,
      agent: {
        id: agent.id,
        name: agent.name,
        template: agent.template,
        icon: agent.icon,
        model: agent.model,
        schedule: agent.schedule,
        status: agent.status,
        createdAt: agent.createdAt,
        config: agent.config,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create agent', detail: err.message });
  }
});

// POST /v1/agents/:id/activate — start an agent's cron schedule
router.post('/agents/:id/activate', authenticateApiKey, async (req, res) => {
  const agent = await getAgent(req.params.id);
  if (!agent || agent.apiKey !== req.infinite.apiKey) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  agent.status = 'active';
  await saveAgent(agent.id, agent);
  scheduleAgent(agent);
  await appendAgentLog(agent.id, { type: 'activated', message: 'Agent activated' });

  res.json({ ok: true, status: 'active' });
});

// POST /v1/agents/:id/pause — stop an agent's cron schedule
router.post('/agents/:id/pause', authenticateApiKey, async (req, res) => {
  const agent = await getAgent(req.params.id);
  if (!agent || agent.apiKey !== req.infinite.apiKey) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  agent.status = 'paused';
  await saveAgent(agent.id, agent);
  unscheduleAgent(agent.id);
  await appendAgentLog(agent.id, { type: 'paused', message: 'Agent paused' });

  res.json({ ok: true, status: 'paused' });
});

// POST /v1/agents/:id/run — trigger a one-off run now
router.post('/agents/:id/run', authenticateApiKey, async (req, res) => {
  const agent = await getAgent(req.params.id);
  if (!agent || agent.apiKey !== req.infinite.apiKey) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  try {
    const result = await executeAgentRun(agent);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /v1/agents/:id/logs — get agent activity logs
router.get('/agents/:id/logs', authenticateApiKey, async (req, res) => {
  const agent = await getAgent(req.params.id);
  if (!agent || agent.apiKey !== req.infinite.apiKey) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  const logs = await getAgentLogs(req.params.id, parseInt(req.query.limit) || 50);
  res.json({ logs });
});

// PUT /v1/agents/:id — update agent config
router.put('/agents/:id', authenticateApiKey, async (req, res) => {
  const agent = await getAgent(req.params.id);
  if (!agent || agent.apiKey !== req.infinite.apiKey) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  const { name, model, schedule, config, taskPrompt } = req.body;
  if (name) agent.name = name;
  if (model) agent.model = model;
  if (schedule) agent.schedule = schedule;
  if (config) agent.config = { ...agent.config, ...config };
  if (taskPrompt) agent.taskPrompt = taskPrompt;

  // If custom agent, allow system prompt update
  if (agent.template === 'custom' && config?.systemPrompt) {
    agent.systemPrompt = config.systemPrompt;
  }

  await saveAgent(agent.id, agent);

  // Reschedule if active
  if (agent.status === 'active') {
    scheduleAgent(agent);
  }

  await appendAgentLog(agent.id, { type: 'updated', message: 'Agent config updated' });

  res.json({ ok: true, agent });
});

// DELETE /v1/agents/:id — delete an agent
router.delete('/agents/:id', authenticateApiKey, async (req, res) => {
  const agent = await getAgent(req.params.id);
  if (!agent || agent.apiKey !== req.infinite.apiKey) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  unscheduleAgent(agent.id);
  await deleteAgent(agent.id, req.infinite.apiKey);

  res.json({ ok: true });
});

// GET /v1/agents/activity — aggregated activity feed across all agents
router.get('/agents/activity', authenticateApiKey, async (req, res) => {
  try {
    const agents = await listAgents(req.infinite.apiKey);
    const limit = parseInt(req.query.limit) || 20;
    const allLogs = [];

    for (const agent of agents) {
      const logs = await getAgentLogs(agent.id, 10);
      for (const log of logs) {
        allLogs.push({
          ...log,
          agentId: agent.id,
          agentName: agent.name,
          template: agent.template,
        });
      }
    }

    // Sort by timestamp descending, take top N
    allLogs.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    res.json({ activity: allLogs.slice(0, limit) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load activity', detail: err.message });
  }
});

export default router;
