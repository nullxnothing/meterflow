// Agent Scheduler — runs cron tasks for virtual agents
import cron from 'node-cron';
import crypto from 'crypto';
import { getAllActiveAgents, getAgent, saveAgent, appendAgentLog } from './lib/kv-agents.js';
import { getProviderForModel, isModelAvailable } from './lib/providers.js';
import { proxyAnthropic } from './providers/anthropic.js';
import { proxyGemini } from './providers/gemini.js';
import { proxyOpenAI } from './providers/openai.js';
import { incrementUsage } from './lib/kv-usage.js';

const activeJobs = new Map(); // agentId -> cron.ScheduledTask

const AGENT_TEMPLATES = {
  'wallet-monitor': {
    name: 'Wallet Monitor',
    description: 'Monitors your Solana wallets for balance changes, large transfers, and suspicious activity. Sends alerts.',
    icon: '[W]',
    defaultModel: 'gemini-2.5-flash',
    defaultSchedule: '*/10 * * * *', // every 10 min
    systemPrompt: `You are a Solana wallet monitoring agent. Your job is to:
1. Check wallet balances and report significant changes
2. Monitor for large incoming/outgoing transactions
3. Alert on any suspicious activity (dust attacks, unknown token airdrops)
4. Track token holdings and their price movements
5. Provide a concise status summary each time you run

Be brief and only alert on meaningful changes. Format numbers clearly.`,
    tools: ['web_search', 'url_reader', 'code_runner'],
    configFields: [
      { id: 'wallets', label: 'Wallet addresses to monitor (one per line)', type: 'textarea', placeholder: 'Enter Solana wallet addresses...' },
      { id: 'alertThreshold', label: 'Alert threshold (SOL)', type: 'number', placeholder: '0.5', default: '0.5' },
    ],
  },
  'trading-agent': {
    name: 'Trading Assistant',
    description: 'Analyzes tokens, tracks trends, and provides trade alerts based on your strategy.',
    icon: '[T]',
    defaultModel: 'gemini-2.5-flash',
    defaultSchedule: '0 */2 * * *', // every 2 hours
    systemPrompt: `You are an autonomous Solana trading analysis agent. Your job is to:
1. Scan for trending tokens on Solana (pump.fun, Raydium, Jupiter)
2. Analyze token fundamentals: liquidity, holder distribution, age
3. Flag high-risk tokens (rug indicators, honeypots, low liquidity)
4. Score opportunities on a 1-10 scale based on risk/reward
5. Track the tokens in your watchlist for price movements

Never recommend financial actions directly. Present data-driven analysis. Include risk levels.`,
    tools: ['web_search', 'url_reader', 'code_runner'],
    configFields: [
      { id: 'strategy', label: 'Trading strategy', type: 'select', options: ['Conservative (blue chips)', 'Moderate (established + new)', 'Aggressive (new launches)'] },
      { id: 'watchlist', label: 'Token addresses to watch (one per line)', type: 'textarea', placeholder: 'Paste token mint addresses...' },
    ],
  },
  'personal-assistant': {
    name: 'Personal Assistant',
    description: 'A general-purpose AI assistant that can research, summarize, and execute tasks on a schedule.',
    icon: '[A]',
    defaultModel: 'gemini-2.5-flash',
    defaultSchedule: '0 9 * * *', // daily at 9am
    systemPrompt: `You are a personal AI assistant. Your job is to:
1. Execute the tasks your user has configured
2. Research topics and provide summaries
3. Keep track of ongoing items and report progress
4. Be proactive about suggesting next steps
5. Deliver concise, actionable information

Always start with the most important updates first.`,
    tools: ['web_search', 'url_reader', 'code_runner', 'github_lookup'],
    configFields: [
      { id: 'tasks', label: 'What should this agent do? (describe your tasks)', type: 'textarea', placeholder: 'e.g., Check my GitHub repos for new issues, summarize crypto news...' },
      { id: 'timezone', label: 'Your timezone', type: 'select', options: ['UTC', 'US/Eastern', 'US/Pacific', 'Europe/London', 'Asia/Tokyo', 'Asia/Singapore'] },
    ],
  },
  'custom': {
    name: 'Custom Agent',
    description: 'Build your own agent from scratch. Define the system prompt, tools, and schedule.',
    icon: '[C]',
    defaultModel: 'gemini-2.5-flash',
    defaultSchedule: '0 */6 * * *',
    systemPrompt: '',
    tools: ['web_search', 'url_reader', 'code_runner'],
    configFields: [
      { id: 'systemPrompt', label: 'System prompt (instructions for the agent)', type: 'textarea', placeholder: 'You are an agent that...' },
      { id: 'taskPrompt', label: 'Task prompt (what to do each run)', type: 'textarea', placeholder: 'Check for... and report...' },
    ],
  },
};

/**
 * Execute a single agent run
 */
async function executeAgentRun(agent) {
  const startTime = Date.now();
  console.log(`[Agent] Running ${agent.id} (${agent.template})`);

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

    // Track usage against the agent owner's API key
    if (agent.apiKey) {
      await incrementUsage(agent.apiKey, result.usage?.totalTokens || 0);
    }

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

    console.log(`[Agent] ${agent.id} completed in ${elapsed}ms`);
    return { ok: true, content, elapsed };

  } catch (err) {
    console.error(`[Agent] ${agent.id} error:`, err.message);
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
    console.error(`[Agent] Invalid cron schedule for ${agent.id}: ${agent.schedule}`);
    return;
  }

  const job = cron.schedule(agent.schedule, () => {
    executeAgentRun(agent).catch(err => {
      console.error(`[Agent] Scheduled run failed for ${agent.id}:`, err.message);
    });
  });

  activeJobs.set(agent.id, job);
  console.log(`[Agent] Scheduled ${agent.id} with cron: ${agent.schedule}`);
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
    console.log(`[Agent Scheduler] Bootstrapping ${agents.length} active agents`);
    for (const agent of agents) {
      scheduleAgent(agent);
    }
  } catch (err) {
    console.error('[Agent Scheduler] Bootstrap failed:', err.message);
  }
}

export {
  AGENT_TEMPLATES,
  executeAgentRun,
  scheduleAgent,
  unscheduleAgent,
  bootstrapScheduler,
};
