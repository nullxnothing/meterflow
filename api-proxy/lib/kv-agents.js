// Persistent agent storage using Redis
import Redis from 'ioredis';

const AGENT_PREFIX = 'infinite:agent:';
const AGENT_LIST_PREFIX = 'infinite:agents:';
const AGENT_LOG_PREFIX = 'infinite:agent-log:';

let redis = null;

function getRedis() {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
    if (!redisUrl) return null;
    try {
      redis = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
      redis.on('error', (err) => console.error('[KV-Agents] Redis error:', err.message));
    } catch (e) {
      console.error('[KV-Agents] Redis connection failed:', e.message);
      return null;
    }
  }
  return redis;
}

// In-memory fallback
const fallbackAgents = new Map(); // agentId -> agentConfig
const fallbackLists = new Map();  // apiKey -> Set<agentId>
const fallbackLogs = new Map();   // agentId -> [{ts, type, message}]

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
    console.error('[KV-Agents] Failed to save:', e.message);
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
    console.error('[KV-Agents] Failed to get:', e.message);
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
    console.error('[KV-Agents] Failed to list:', e.message);
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
    console.error('[KV-Agents] Failed to delete:', e.message);
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
    console.error('[KV-Agents] Failed to append log:', e.message);
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
    console.error('[KV-Agents] Failed to get logs:', e.message);
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
    console.error('[KV-Agents] Failed to get all active:', e.message);
    return [...fallbackAgents.values()].filter(a => a.status === 'active');
  }
}
