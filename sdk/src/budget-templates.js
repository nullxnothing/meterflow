export const BUDGET_TEMPLATES = Object.freeze({
  research_agent: {
    id: 'research_agent',
    name: 'Research Agent',
    description: 'Safe default for agents that call data, search, social, and token intelligence routes.',
    dailyCapUsd: 5,
    perCallCapUsd: 0.02,
    allowedRoutes: ['/v1/alpha/*', '/mcp/token-risk'],
    expiresInHours: 24,
    onExhausted: 'stop_workflow',
    onNewRoute: 'require_operator_approval',
  },
  token_risk_agent: {
    id: 'token_risk_agent',
    name: 'Token Risk Agent',
    description: 'Budget for token scanners, risk scoring bots, and wallet/token enrichment workflows.',
    dailyCapUsd: 12,
    perCallCapUsd: 0.05,
    allowedRoutes: ['/mcp/token-risk', '/v1/alpha/*', '/v1/trading/analysis/*'],
    expiresInHours: 24,
    onExhausted: 'stop_workflow',
    onNewRoute: 'require_operator_approval',
  },
  trading_bot: {
    id: 'trading_bot',
    name: 'Trading Bot',
    description: 'Tighter policy for bots that request trading analysis or execution-adjacent data.',
    dailyCapUsd: 25,
    perCallCapUsd: 0.10,
    allowedRoutes: ['/v1/trading/*', '/v1/alpha/*', '/mcp/token-risk'],
    expiresInHours: 12,
    onExhausted: 'pause_agent',
    onNewRoute: 'require_operator_approval',
  },
  hackathon_demo: {
    id: 'hackathon_demo',
    name: 'Hackathon Demo',
    description: 'Small cap for demos, judges, and public testing without risking runaway spend.',
    dailyCapUsd: 2,
    perCallCapUsd: 0.01,
    allowedRoutes: ['/v1/chat', '/v1/multi', '/mcp/token-risk'],
    expiresInHours: 8,
    onExhausted: 'stop_workflow',
    onNewRoute: 'block',
  },
  production_agent: {
    id: 'production_agent',
    name: 'Production Agent',
    description: 'Higher default cap for monitored production workflows with route-level controls.',
    dailyCapUsd: 100,
    perCallCapUsd: 0.25,
    allowedRoutes: ['/v1/chat', '/v1/multi', '/v1/alpha/*', '/v1/trading/*', '/mcp/*'],
    expiresInHours: 168,
    onExhausted: 'alert_and_pause',
    onNewRoute: 'require_operator_approval',
  },
});

export function listBudgetTemplates() {
  return Object.values(BUDGET_TEMPLATES).map(template => ({ ...template }));
}

export function getBudgetTemplate(templateId) {
  const template = BUDGET_TEMPLATES[templateId];
  return template ? { ...template } : null;
}

export function buildBudgetFromTemplate(templateId, overrides = {}) {
  const template = getBudgetTemplate(templateId);
  if (!template) {
    throw new Error(`Unknown Meterflow budget template: ${templateId}`);
  }

  const expiresAt = overrides.expiresAt || new Date(Date.now() + Number(template.expiresInHours || 24) * 60 * 60 * 1000).toISOString();

  return {
    name: overrides.name || template.name,
    agentId: overrides.agentId || templateId,
    dailyCapUsd: Number(overrides.dailyCapUsd ?? template.dailyCapUsd),
    perCallCapUsd: Number(overrides.perCallCapUsd ?? template.perCallCapUsd),
    allowedRoutes: overrides.allowedRoutes || template.allowedRoutes,
    expiresAt,
    metadata: {
      ...(overrides.metadata || {}),
      templateId,
      onExhausted: overrides.onExhausted || template.onExhausted,
      onNewRoute: overrides.onNewRoute || template.onNewRoute,
    },
  };
}

export function simulateBudget({ dailyCapUsd, perCallCapUsd, callsPerDay = 0, averageCallPriceUsd = null }) {
  const dailyCap = Number(dailyCapUsd || 0);
  const perCallCap = Number(perCallCapUsd || 0);
  const callPrice = Number(averageCallPriceUsd ?? perCallCapUsd ?? 0);
  const calls = Number(callsPerDay || 0);
  const estimatedDailySpendUsd = Number((calls * callPrice).toFixed(6));
  const maxCallsByDailyCap = callPrice > 0 ? Math.floor(dailyCap / callPrice) : null;

  return {
    dailyCapUsd: dailyCap,
    perCallCapUsd: perCall,
    callsPerDay: calls,
    averageCallPriceUsd: callPrice,
    estimatedDailySpendUsd,
    maxCallsByDailyCap,
    exceedsPerCallCap: callPrice > perCall,
    exceedsDailyCap: estimatedDailySpendUsd > dailyCap,
    remainingDailyBudgetUsd: Number(Math.max(0, dailyCap - estimatedDailySpendUsd).toFixed(6)),
  };
}
