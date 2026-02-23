// Agent Scheduler — runs cron tasks for virtual agents
import cron from 'node-cron';
import crypto from 'crypto';
import { getAllActiveAgents, getAgent, saveAgent, appendAgentLog } from './lib/kv-agents.js';
import { getProviderForModel, isModelAvailable } from './lib/providers.js';
import { proxyAnthropic } from './providers/anthropic.js';
import { proxyGemini } from './providers/gemini.js';
import { proxyOpenAI } from './providers/openai.js';
import { incrementUsage, incrementGlobalStats } from './lib/kv-usage.js';
import { logger } from './lib/logger.js';

const activeJobs = new Map(); // agentId -> cron.ScheduledTask

const AGENT_TEMPLATES = {
  // ── On-Chain ──
  'wallet-watcher': {
    name: 'Watch a Wallet',
    description: 'Get alerts when funds move in or out.',
    category: 'on-chain',
    defaultModel: 'gemini-2.5-flash',
    defaultSchedule: '*/5 * * * *',
    scheduleLabel: 'Every 5 min',
    systemPrompt: `You are a Solana wallet monitoring agent. Check wallet balances and report significant changes. Monitor for large incoming/outgoing transactions. Alert on suspicious activity (dust attacks, unknown airdrops). Be brief — only report meaningful changes. Start with a one-sentence summary.`,
    tools: ['web_search', 'url_reader', 'code_runner'],
    configFields: [
      { id: 'walletAddress', label: 'Wallet address', type: 'text', placeholder: 'Enter a Solana wallet address' },
      { id: 'alertTypes', label: 'Alert me about', type: 'text', placeholder: 'SOL transfers, Token sends & receives', default: 'SOL transfers, Token sends & receives' },
    ],
    scheduleOptions: [
      { value: '*/5 * * * *', label: 'Every 5 min' },
      { value: '*/30 * * * *', label: 'Every 30 min' },
      { value: '0 * * * *', label: 'Hourly' },
    ],
  },
  'token-scanner': {
    name: 'Scan New Tokens',
    description: 'Auto-score new pump.fun launches by risk and potential.',
    category: 'on-chain',
    defaultModel: 'gemini-2.5-flash',
    defaultSchedule: '*/10 * * * *',
    scheduleLabel: 'Every 10 min',
    systemPrompt: `You are a Solana token scanner. Scan for new token launches on pump.fun and Raydium. Score each token on a 1-10 scale for risk/reward. Check liquidity, holder count, and contract flags. Never recommend buys — present data only. Start with a one-sentence summary of what you found.`,
    tools: ['web_search', 'url_reader', 'code_runner'],
    configFields: [
      { id: 'minLiquidity', label: 'Minimum liquidity (SOL)', type: 'number', placeholder: '2', default: '2' },
      { id: 'riskTolerance', label: 'Risk tolerance', type: 'select', options: ['Conservative', 'Moderate', 'Aggressive'] },
    ],
    scheduleOptions: [
      { value: '*/5 * * * *', label: 'Every 5 min' },
      { value: '*/10 * * * *', label: 'Every 10 min' },
      { value: '*/30 * * * *', label: 'Every 30 min' },
    ],
  },
  'smart-money': {
    name: 'Track Smart Money',
    description: 'Follow top wallets and surface their buys.',
    category: 'on-chain',
    defaultModel: 'gemini-2.5-flash',
    defaultSchedule: '*/30 * * * *',
    scheduleLabel: 'Every 30 min',
    systemPrompt: `You are a smart money tracker for Solana. Monitor the provided wallet addresses for new token purchases and significant moves. Summarize what they're buying and selling. Flag when multiple wallets converge on the same token. Start with a one-sentence summary.`,
    tools: ['web_search', 'url_reader', 'code_runner'],
    configFields: [
      { id: 'wallets', label: 'Wallets to follow (one per line)', type: 'textarea', placeholder: 'Paste wallet addresses...' },
    ],
    scheduleOptions: [
      { value: '*/30 * * * *', label: 'Every 30 min' },
      { value: '0 * * * *', label: 'Hourly' },
      { value: '0 */2 * * *', label: 'Every 2 hours' },
    ],
  },

  // ── Content ──
  'thread-writer': {
    name: 'Thread Writer',
    description: 'Draft Twitter threads on any topic.',
    category: 'content',
    defaultModel: 'gemini-2.5-flash',
    defaultSchedule: '0 9 * * *',
    scheduleLabel: 'Daily 9AM',
    systemPrompt: `You are a Twitter thread writer. Research the given topic and draft a compelling 5-8 tweet thread. Match the requested style. Use data and examples. No hashtag spam. Start with a hook that grabs attention.`,
    tools: ['web_search', 'url_reader'],
    configFields: [
      { id: 'topic', label: 'Topic', type: 'text', placeholder: 'e.g., Solana DeFi trends this week' },
      { id: 'style', label: 'Style', type: 'select', options: ['Educational', 'Opinionated', 'News recap'] },
    ],
    scheduleOptions: [
      { value: '0 9 * * *', label: 'Daily 9AM' },
      { value: '0 9,21 * * *', label: 'Twice daily' },
      { value: '0 9 * * 1', label: 'Weekly Monday' },
    ],
  },
  'daily-briefing': {
    name: 'Daily Briefing',
    description: 'Morning summary of your chosen topics.',
    category: 'content',
    defaultModel: 'gemini-2.5-flash',
    defaultSchedule: '0 9 * * *',
    scheduleLabel: 'Daily 9AM',
    systemPrompt: `You are a daily briefing agent. Research the provided topics and deliver a concise morning summary. Lead with the most important developments. Use bullet points. Keep it under 300 words. Start with a one-sentence headline.`,
    tools: ['web_search', 'url_reader'],
    configFields: [
      { id: 'topics', label: 'Topics (one per line)', type: 'textarea', placeholder: 'Solana ecosystem\nAI news\nCrypto regulation' },
    ],
    scheduleOptions: [
      { value: '0 9 * * *', label: 'Daily 9AM' },
      { value: '0 9 * * 1-5', label: 'Weekdays 9AM' },
      { value: '0 9,18 * * *', label: 'Morning & evening' },
    ],
  },
  'content-repurpose': {
    name: 'Content Repurposer',
    description: 'Turn long-form content into multiple formats.',
    category: 'content',
    defaultModel: 'gemini-2.5-flash',
    defaultSchedule: 'manual',
    scheduleLabel: 'On demand',
    systemPrompt: `You are a content repurposing agent. Take the provided long-form content and create: 1) A Twitter thread (5-8 tweets), 2) A short summary (100 words), 3) Key takeaways (3-5 bullets). Preserve the original voice and key points.`,
    tools: ['web_search', 'url_reader'],
    configFields: [
      { id: 'sourceContent', label: 'Content to repurpose', type: 'textarea', placeholder: 'Paste your article, blog post, or long-form content...' },
    ],
    scheduleOptions: [],
  },

  // ── Research ──
  'trend-watcher': {
    name: 'Trend Watcher',
    description: 'Surface top crypto and tech narratives.',
    category: 'research',
    defaultModel: 'gemini-2.5-flash',
    defaultSchedule: '0 */6 * * *',
    scheduleLabel: 'Every 6 hours',
    systemPrompt: `You are a trend analysis agent. Scan crypto and tech sources for emerging narratives, hot topics, and sentiment shifts. Rank the top 5 trends by momentum. Include brief context for each. Start with a one-sentence summary of the current mood.`,
    tools: ['web_search', 'url_reader'],
    configFields: [
      { id: 'focus', label: 'Focus area', type: 'select', options: ['Crypto', 'Tech', 'Both'] },
      { id: 'sources', label: 'Extra sources (optional, one per line)', type: 'textarea', placeholder: 'https://...' },
    ],
    scheduleOptions: [
      { value: '0 */6 * * *', label: 'Every 6 hours' },
      { value: '0 */12 * * *', label: 'Twice daily' },
      { value: '0 9 * * *', label: 'Daily 9AM' },
    ],
  },
  'competitor-tracker': {
    name: 'Competitor Tracker',
    description: 'Watch projects for updates and changes.',
    category: 'research',
    defaultModel: 'gemini-2.5-flash',
    defaultSchedule: '0 9 * * *',
    scheduleLabel: 'Daily',
    systemPrompt: `You are a competitive intelligence agent. Monitor the provided projects/companies for news, product updates, partnerships, and social buzz. Compare activity levels. Flag anything significant. Start with a one-sentence overview.`,
    tools: ['web_search', 'url_reader'],
    configFields: [
      { id: 'projects', label: 'Projects to track (one per line)', type: 'textarea', placeholder: 'Jupiter\nDrift Protocol\nMarinade Finance' },
    ],
    scheduleOptions: [
      { value: '0 9 * * *', label: 'Daily' },
      { value: '0 9 * * 1,4', label: 'Mon & Thu' },
      { value: '0 9 * * 1', label: 'Weekly Monday' },
    ],
  },

  // ── Productivity ──
  'code-reviewer': {
    name: 'Code Reviewer',
    description: 'Paste code and get a senior-level review.',
    category: 'productivity',
    defaultModel: 'gemini-2.5-flash',
    defaultSchedule: 'manual',
    scheduleLabel: 'On demand',
    systemPrompt: `You are a senior code reviewer. Analyze the provided code for: bugs, security issues, performance problems, readability, and best practices. Be constructive and specific. Suggest concrete fixes. Start with a one-sentence verdict.`,
    tools: ['code_runner'],
    configFields: [
      { id: 'language', label: 'Language', type: 'select', options: ['JavaScript', 'TypeScript', 'Python', 'Rust', 'Solidity', 'Other'] },
      { id: 'taskPrompt', label: 'Code to review', type: 'textarea', placeholder: 'Paste your code here...' },
    ],
    scheduleOptions: [],
  },

  // ── Custom ──
  'custom': {
    name: 'Custom Agent',
    description: 'Define your own prompt and schedule.',
    category: 'custom',
    defaultModel: 'gemini-2.5-flash',
    defaultSchedule: '0 */6 * * *',
    scheduleLabel: 'Every 6 hours',
    systemPrompt: '',
    tools: ['web_search', 'url_reader', 'code_runner'],
    configFields: [
      { id: 'systemPrompt', label: 'System prompt', type: 'textarea', placeholder: 'You are an agent that...' },
      { id: 'taskPrompt', label: 'Task prompt', type: 'textarea', placeholder: 'Check for... and report...' },
    ],
    scheduleOptions: [
      { value: '*/5 * * * *', label: 'Every 5 min' },
      { value: '*/30 * * * *', label: 'Every 30 min' },
      { value: '0 * * * *', label: 'Hourly' },
      { value: '0 */6 * * *', label: 'Every 6 hours' },
      { value: '0 9 * * *', label: 'Daily 9AM' },
    ],
  },

  // ── Legacy aliases (keep for existing agents, hidden from picker) ──
  'wallet-monitor': {
    name: 'Wallet Monitor',
    description: 'Legacy wallet monitor',
    category: '_legacy',
    defaultModel: 'gemini-2.5-flash',
    defaultSchedule: '*/10 * * * *',
    systemPrompt: `You are a Solana wallet monitoring agent. Check wallet balances and report significant changes. Monitor for large incoming/outgoing transactions. Alert on suspicious activity. Be brief and only alert on meaningful changes.`,
    tools: ['web_search', 'url_reader', 'code_runner'],
    configFields: [
      { id: 'wallets', label: 'Wallet addresses (one per line)', type: 'textarea', placeholder: 'Enter Solana wallet addresses...' },
      { id: 'alertThreshold', label: 'Alert threshold (SOL)', type: 'number', placeholder: '0.5', default: '0.5' },
    ],
    scheduleOptions: [],
  },
  'trading-agent': {
    name: 'Trading Assistant',
    description: 'Legacy trading assistant',
    category: '_legacy',
    defaultModel: 'gemini-2.5-flash',
    defaultSchedule: '0 */2 * * *',
    systemPrompt: `You are a Solana trading analysis agent. Scan for trending tokens. Analyze fundamentals. Flag high-risk tokens. Score opportunities 1-10. Never recommend financial actions directly.`,
    tools: ['web_search', 'url_reader', 'code_runner'],
    configFields: [
      { id: 'strategy', label: 'Trading strategy', type: 'select', options: ['Conservative', 'Moderate', 'Aggressive'] },
      { id: 'watchlist', label: 'Token addresses (one per line)', type: 'textarea', placeholder: 'Paste token mint addresses...' },
    ],
    scheduleOptions: [],
  },
  'personal-assistant': {
    name: 'Personal Assistant',
    description: 'Legacy personal assistant',
    category: '_legacy',
    defaultModel: 'gemini-2.5-flash',
    defaultSchedule: '0 9 * * *',
    systemPrompt: `You are a personal AI assistant. Execute configured tasks, research topics, provide summaries, and suggest next steps. Start with the most important updates.`,
    tools: ['web_search', 'url_reader', 'code_runner', 'github_lookup'],
    configFields: [
      { id: 'tasks', label: 'Tasks', type: 'textarea', placeholder: 'Describe your tasks...' },
      { id: 'timezone', label: 'Timezone', type: 'select', options: ['UTC', 'US/Eastern', 'US/Pacific', 'Europe/London', 'Asia/Tokyo', 'Asia/Singapore'] },
    ],
    scheduleOptions: [],
  },
};

/**
 * Execute a single agent run
 */
async function executeAgentRun(agent) {
  const startTime = Date.now();
  logger.info(`Running agent ${agent.id} (${agent.template})`);

  try {
    await appendAgentLog(agent.id, { type: 'run_start', message: 'Agent run started' });

    const model = agent.model || 'gemini-2.5-flash';
    const messages = [];

    // Inject system prompt as first user context
    if (agent.systemPrompt) {
      messages.push({ role: 'user', content: `[System Instructions]\n${agent.systemPrompt}\n\n[End System Instructions]` });
      messages.push({ role: 'assistant', content: 'Understood. I will follow these instructions.' });
    }

    const taskContent = agent.taskPrompt || `Execute your monitoring/analysis tasks. Current time: ${new Date().toISOString()}`;

    // Add context from agent config
    const contextParts = [];
    if (agent.config) {
      for (const [key, val] of Object.entries(agent.config)) {
        if (val && key !== 'systemPrompt' && key !== 'taskPrompt' && key !== 'agentName' && key !== 'model' && key !== 'schedule') {
          contextParts.push(`${key}: ${val}`);
        }
      }
    }

    messages.push({
      role: 'user',
      content: taskContent + (contextParts.length ? `\n\nAgent configuration:\n${contextParts.join('\n')}` : ''),
    });

    let result;
    if (model.startsWith('claude')) {
      result = await proxyAnthropic(model, messages, 2048, 0.3);
    } else if (model.startsWith('gemini')) {
      result = await proxyGemini(model, messages, 2048, 0.3);
    } else if (model.startsWith('gpt-')) {
      result = await proxyOpenAI(model, messages, 2048, 0.3);
    } else {
      throw new Error(`Unsupported model: ${model}`);
    }

    // Track usage against the agent owner's API key + global stats
    const usageTokens = result.usage?.totalTokens || 0;
    if (agent.apiKey) {
      await incrementUsage(agent.apiKey, usageTokens);
    }
    await incrementGlobalStats(usageTokens);

    const elapsed = Date.now() - startTime;
    const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);

    // Update agent state
    const updated = await getAgent(agent.id);
    if (updated) {
      updated.lastRun = Date.now();
      updated.lastResult = content.slice(0, 2000); // store truncated result
      updated.runCount = (updated.runCount || 0) + 1;
      updated.totalTokens = (updated.totalTokens || 0) + (result.usage?.totalTokens || 0);
      await saveAgent(agent.id, updated);
    }

    await appendAgentLog(agent.id, {
      type: 'run_complete',
      message: content.slice(0, 500),
      tokens: result.usage?.totalTokens || 0,
      elapsed,
    });

    logger.info(`Agent ${agent.id} completed`, { elapsed });
    return { ok: true, content, elapsed };

  } catch (err) {
    logger.error(`Agent ${agent.id} error`, { err: err.message });
    await appendAgentLog(agent.id, { type: 'run_error', message: err.message });

    const updated = await getAgent(agent.id);
    if (updated) {
      updated.lastRun = Date.now();
      updated.lastError = err.message;
      await saveAgent(agent.id, updated);
    }

    return { ok: false, error: err.message };
  }
}

/**
 * Schedule a cron job for an agent
 */
function scheduleAgent(agent) {
  // Stop existing job if any
  unscheduleAgent(agent.id);

  if (agent.status !== 'active' || !agent.schedule) return;

  if (!cron.validate(agent.schedule)) {
    logger.error(`Invalid cron schedule for ${agent.id}`, { schedule: agent.schedule });
    return;
  }

  const job = cron.schedule(agent.schedule, () => {
    executeAgentRun(agent).catch(err => {
      logger.error(`Scheduled run failed for ${agent.id}`, { err: err.message });
    });
  });

  activeJobs.set(agent.id, job);
  logger.info(`Scheduled ${agent.id}`, { cron: agent.schedule });
}

/**
 * Unschedule a cron job for an agent
 */
function unscheduleAgent(agentId) {
  const job = activeJobs.get(agentId);
  if (job) {
    job.stop();
    activeJobs.delete(agentId);
  }
}

/**
 * Bootstrap — load all active agents from Redis and schedule them
 */
async function bootstrapScheduler() {
  try {
    const agents = await getAllActiveAgents();
    logger.info(`Bootstrapping ${agents.length} active agents`);
    for (const agent of agents) {
      scheduleAgent(agent);
    }
  } catch (err) {
    logger.error('Agent scheduler bootstrap failed', { err: err.message });
  }
}

export {
  AGENT_TEMPLATES,
  executeAgentRun,
  scheduleAgent,
  unscheduleAgent,
  bootstrapScheduler,
};
