// Persistent agent storage using Redis
import { getRedis } from './redis.js';
import { logger } from './logger.js';

const AGENT_PREFIX = 'infinite:agent:';
const AGENT_LIST_PREFIX = 'infinite:agents:';
const AGENT_LOG_PREFIX = 'infinite:agent-log:';
const IS_PROD = process.env.NODE_ENV === 'production';

// Funded agent key prefixes
const FUNDED_WALLET_PREFIX = 'infinite:agent:by-wallet:';
const FUNDED_TOKEN_PREFIX = 'infinite:agent:by-token:';
const FUNDED_ACTIVE_SET = 'infinite:funded-agents:active';

// In-memory fallback
const fallbackAgents = new Map(); // agentId -> agentConfig
const fallbackLists = new Map();  // apiKey -> Set<agentId>
const fallbackLogs = new Map();   // agentId -> [{ts, type, message}]

// Funded agent fallback stores
const fallbackWalletAgents = new Map(); // wallet -> agentId[]
const fallbackTokenAgents = new Map();  // mintAddress -> agentId
const fallbackFundedActive = new Set(); // agentId set

// ---------------------------------------------------------------------------
// Original agent CRUD (used by agent-scheduler, routes/agents)
// ---------------------------------------------------------------------------

/**
 * Save an agent config
 */
export async function saveAgent(agentId, config) {
  const r = getRedis();
  const json = JSON.stringify(config);

  if (!r) {
    fallbackAgents.set(agentId, config);
    if (!fallbackLists.has(config.apiKey)) fallbackLists.set(config.apiKey, new Set());
    fallbackLists.get(config.apiKey).add(agentId);
    return;
  }

  try {
    await r.set(`${AGENT_PREFIX}${agentId}`, json);
    await r.sadd(`${AGENT_LIST_PREFIX}${config.apiKey}`, agentId);
  } catch (e) {
    logger.error('KV-Agents failed to save', { err: e.message });
    fallbackAgents.set(agentId, config);
    if (!fallbackLists.has(config.apiKey)) fallbackLists.set(config.apiKey, new Set());
    fallbackLists.get(config.apiKey).add(agentId);
  }
}

/**
 * Get a single agent
 */
export async function getAgent(agentId) {
  const r = getRedis();

  if (!r) return fallbackAgents.get(agentId) || null;

  try {
    const data = await r.get(`${AGENT_PREFIX}${agentId}`);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    logger.error('KV-Agents failed to get', { err: e.message });
    return fallbackAgents.get(agentId) || null;
  }
}

/**
 * List all agents for an API key
 */
export async function listAgents(apiKey) {
  const r = getRedis();

  if (!r) {
    const ids = fallbackLists.get(apiKey);
    if (!ids) return [];
    return Promise.all([...ids].map(id => getAgent(id))).then(arr => arr.filter(Boolean));
  }

  try {
    const ids = await r.smembers(`${AGENT_LIST_PREFIX}${apiKey}`);
    if (!ids.length) return [];
    const agents = await Promise.all(ids.map(id => getAgent(id)));
    return agents.filter(Boolean);
  } catch (e) {
    logger.error('KV-Agents failed to list', { err: e.message });
    const ids = fallbackLists.get(apiKey);
    if (!ids) return [];
    return Promise.all([...ids].map(id => getAgent(id))).then(arr => arr.filter(Boolean));
  }
}

/**
 * Delete an agent
 */
export async function deleteAgent(agentId, apiKey) {
  const r = getRedis();

  if (!r) {
    fallbackAgents.delete(agentId);
    fallbackLists.get(apiKey)?.delete(agentId);
    fallbackLogs.delete(agentId);
    return;
  }

  try {
    await r.del(`${AGENT_PREFIX}${agentId}`);
    await r.srem(`${AGENT_LIST_PREFIX}${apiKey}`, agentId);
    await r.del(`${AGENT_LOG_PREFIX}${agentId}`);
  } catch (e) {
    logger.error('KV-Agents failed to delete', { err: e.message });
    fallbackAgents.delete(agentId);
    fallbackLists.get(apiKey)?.delete(agentId);
  }
}

/**
 * Append a log entry for an agent
 */
export async function appendAgentLog(agentId, entry) {
  const record = { ts: Date.now(), ...entry };
  const r = getRedis();

  if (!r) {
    if (!fallbackLogs.has(agentId)) fallbackLogs.set(agentId, []);
    const logs = fallbackLogs.get(agentId);
    logs.push(record);
    if (logs.length > 100) logs.shift(); // keep last 100
    return;
  }

  try {
    await r.lpush(`${AGENT_LOG_PREFIX}${agentId}`, JSON.stringify(record));
    await r.ltrim(`${AGENT_LOG_PREFIX}${agentId}`, 0, 99); // keep last 100
    await r.expire(`${AGENT_LOG_PREFIX}${agentId}`, 7 * 24 * 3600); // 7 day TTL
  } catch (e) {
    logger.error('KV-Agents failed to append log', { err: e.message });
  }
}

/**
 * Get logs for an agent
 */
export async function getAgentLogs(agentId, limit = 50) {
  const r = getRedis();

  if (!r) {
    const logs = fallbackLogs.get(agentId) || [];
    return logs.slice(-limit).reverse();
  }

  try {
    const raw = await r.lrange(`${AGENT_LOG_PREFIX}${agentId}`, 0, limit - 1);
    return raw.map(s => JSON.parse(s));
  } catch (e) {
    logger.error('KV-Agents failed to get logs', { err: e.message });
    return [];
  }
}

/**
 * Get all active agents (for scheduler bootstrap)
 */
export async function getAllActiveAgents() {
  const r = getRedis();

  if (!r) {
    return [...fallbackAgents.values()].filter(a => a.status === 'active');
  }

  try {
    // Scan for all agent keys
    const agents = [];
    let cursor = '0';
    do {
      const [next, keys] = await r.scan(cursor, 'MATCH', `${AGENT_PREFIX}*`, 'COUNT', 100);
      cursor = next;
      for (const key of keys) {
        // Skip index keys (by-wallet:, by-token:)
        if (key.includes(':by-wallet:') || key.includes(':by-token:')) continue;
        try {
          const data = await r.get(key);
          if (data) {
            const agent = JSON.parse(data);
            if (agent.status === 'active') agents.push(agent);
          }
        } catch {}
      }
    } while (cursor !== '0');
    return agents;
  } catch (e) {
    logger.error('KV-Agents failed to get all active', { err: e.message });
    return [...fallbackAgents.values()].filter(a => a.status === 'active');
  }
}

// ---------------------------------------------------------------------------
// Funded agent functions (used by launch route)
// ---------------------------------------------------------------------------

/** Store or update a funded agent */
export async function setFundedAgent(agentId, data) {
  fallbackAgents.set(agentId, data);
  const r = getRedis();
  if (!r) return;

  try {
    await r.set(`${AGENT_PREFIX}${agentId}`, JSON.stringify(data));
  } catch (e) {
    logger.error('kv-agents: failed to set funded agent', { err: e.message, agentId });
    if (IS_PROD) throw new Error('Agent store unavailable');
  }
}

/** Get all funded agent IDs for a wallet */
export async function getFundedAgentsByWallet(wallet) {
  const r = getRedis();
  if (!r) return fallbackWalletAgents.get(wallet) || [];

  try {
    const data = await r.get(`${FUNDED_WALLET_PREFIX}${wallet}`);
    if (data) return JSON.parse(data);
    return fallbackWalletAgents.get(wallet) || [];
  } catch (e) {
    logger.error('kv-agents: failed to get wallet agents', { err: e.message, wallet });
    if (IS_PROD) throw new Error('Agent store unavailable');
    return fallbackWalletAgents.get(wallet) || [];
  }
}

/** Add a funded agent ID to a wallet's list */
export async function addFundedAgentToWallet(wallet, agentId) {
  const existing = fallbackWalletAgents.get(wallet) || [];
  if (!existing.includes(agentId)) existing.push(agentId);
  fallbackWalletAgents.set(wallet, existing);

  const r = getRedis();
  if (!r) return;

  try {
    const raw = await r.get(`${FUNDED_WALLET_PREFIX}${wallet}`);
    const ids = raw ? JSON.parse(raw) : [];
    if (!ids.includes(agentId)) ids.push(agentId);
    await r.set(`${FUNDED_WALLET_PREFIX}${wallet}`, JSON.stringify(ids));
  } catch (e) {
    logger.error('kv-agents: failed to add agent to wallet', { err: e.message, wallet, agentId });
    if (IS_PROD) throw new Error('Agent store unavailable');
  }
}

/** Get funded agent ID linked to a token mint address */
export async function getFundedAgentByToken(mintAddress) {
  const r = getRedis();
  if (!r) return fallbackTokenAgents.get(mintAddress) || null;

  try {
    const agentId = await r.get(`${FUNDED_TOKEN_PREFIX}${mintAddress}`);
    if (agentId) return agentId;
    return fallbackTokenAgents.get(mintAddress) || null;
  } catch (e) {
    logger.error('kv-agents: failed to get agent by token', { err: e.message, mintAddress });
    if (IS_PROD) throw new Error('Agent store unavailable');
    return fallbackTokenAgents.get(mintAddress) || null;
  }
}

/** Link a token mint address to a funded agent ID */
export async function setFundedAgentToken(mintAddress, agentId) {
  fallbackTokenAgents.set(mintAddress, agentId);
  const r = getRedis();
  if (!r) return;

  try {
    await r.set(`${FUNDED_TOKEN_PREFIX}${mintAddress}`, agentId);
  } catch (e) {
    logger.error('kv-agents: failed to set agent token', { err: e.message, mintAddress, agentId });
    if (IS_PROD) throw new Error('Agent store unavailable');
  }
}

/** Atomically update a funded agent's credit balance. Returns the updated agent or null. */
export async function updateAgentCredits(agentId, deltaUsdCents) {
  const agent = await getAgent(agentId);
  if (!agent) return null;

  const credits = agent.credits || { balance: 0, totalEarned: 0, totalSpent: 0 };
  credits.balance += deltaUsdCents;
  if (deltaUsdCents > 0) credits.totalEarned += deltaUsdCents;
  if (deltaUsdCents < 0) credits.totalSpent += Math.abs(deltaUsdCents);
  agent.credits = credits;

  // Auto-deplete if balance hits zero
  if (credits.balance <= 0 && agent.status === 'active') {
    agent.status = 'depleted';
    fallbackFundedActive.delete(agentId);
    const r = getRedis();
    if (r) {
      try { await r.srem(FUNDED_ACTIVE_SET, agentId); } catch {}
    }
  }

  await setFundedAgent(agentId, agent);
  return agent;
}

/** List all funded agents with status "active" */
export async function listFundedActiveAgents() {
  const r = getRedis();

  let ids;
  if (!r) {
    ids = [...fallbackFundedActive];
  } else {
    try {
      ids = await r.smembers(FUNDED_ACTIVE_SET);
    } catch (e) {
      logger.error('kv-agents: failed to list funded active agents', { err: e.message });
      ids = [...fallbackFundedActive];
    }
  }

  const agents = [];
  for (const id of ids) {
    const agent = await getAgent(id);
    if (agent && agent.status === 'active') agents.push(agent);
  }
  return agents;
}

/** Mark a funded agent as active */
export async function activateFundedAgent(agentId) {
  const agent = await getAgent(agentId);
  if (!agent) return null;

  agent.status = 'active';
  await setFundedAgent(agentId, agent);
  fallbackFundedActive.add(agentId);

  const r = getRedis();
  if (r) {
    try { await r.sadd(FUNDED_ACTIVE_SET, agentId); } catch {}
  }
  return agent;
}

/** Mark a funded agent as paused */
export async function pauseFundedAgent(agentId) {
  const agent = await getAgent(agentId);
  if (!agent) return null;

  agent.status = 'paused';
  await setFundedAgent(agentId, agent);
  fallbackFundedActive.delete(agentId);

  const r = getRedis();
  if (r) {
    try { await r.srem(FUNDED_ACTIVE_SET, agentId); } catch {}
  }
  return agent;
}
