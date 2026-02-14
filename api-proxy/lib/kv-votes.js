// Persistent vote storage using Redis (Railway or Upstash)
import Redis from 'ioredis';

// Keys
const VOTE_COUNTS_KEY = 'infinite:vote_counts';
const WALLET_VOTES_PREFIX = 'infinite:wallet_votes:';

// Initialize Redis client
let redis = null;

function getRedis() {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
    if (!redisUrl) {
      console.warn('[KV] Redis not configured — votes will use in-memory fallback');
      return null;
    }
    try {
      redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
      redis.on('error', (err) => console.error('[KV] Redis error:', err.message));
    } catch (e) {
      console.error('[KV] Redis connection failed:', e.message);
      return null;
    }
  }
  return redis;
}

// In-memory fallback when Redis is not configured
const fallbackVoteCounts = {};
const fallbackWalletVotes = new Map();

/**
 * Get all vote counts
 * @returns {Promise<Record<string, number>>}
 */
export async function getVoteCounts() {
  const r = getRedis();
  if (!r) return { ...fallbackVoteCounts };
  
  try {
    const counts = await r.hgetall(VOTE_COUNTS_KEY);
    // Convert string values to numbers
    const result = {};
    for (const [key, val] of Object.entries(counts || {})) {
      result[key] = parseInt(val, 10) || 0;
    }
    return result;
  } catch (e) {
    console.error('[KV] Failed to get vote counts:', e);
    return { ...fallbackVoteCounts };
  }
}

/**
 * Get votes for a specific wallet
 * @param {string} wallet
 * @returns {Promise<string[]>}
 */
export async function getWalletVotes(wallet) {
  const r = getRedis();
  if (!r) {
    const votes = fallbackWalletVotes.get(wallet);
    return votes ? Array.from(votes) : [];
  }
  
  try {
    const votes = await r.smembers(`${WALLET_VOTES_PREFIX}${wallet}`);
    return votes || [];
  } catch (e) {
    console.error('[KV] Failed to get wallet votes:', e);
    return [];
  }
}

/**
 * Toggle a vote for an API
 * @param {string} wallet
 * @param {string} apiId
 * @returns {Promise<{ voted: boolean, counts: Record<string, number>, userVotes: string[] }>}
 */
export async function toggleVote(wallet, apiId) {
  const r = getRedis();
  
  if (!r) {
    // In-memory fallback
    if (!fallbackWalletVotes.has(wallet)) fallbackWalletVotes.set(wallet, new Set());
    const votes = fallbackWalletVotes.get(wallet);
    
    let voted;
    if (votes.has(apiId)) {
      votes.delete(apiId);
      fallbackVoteCounts[apiId] = Math.max(0, (fallbackVoteCounts[apiId] || 1) - 1);
      voted = false;
    } else {
      votes.add(apiId);
      fallbackVoteCounts[apiId] = (fallbackVoteCounts[apiId] || 0) + 1;
      voted = true;
    }
    
    return {
      voted,
      counts: { ...fallbackVoteCounts },
      userVotes: Array.from(votes),
    };
  }
  
  try {
    const walletKey = `${WALLET_VOTES_PREFIX}${wallet}`;
    
    // Check if already voted
    const hasVoted = await r.sismember(walletKey, apiId);
    let voted;
    
    if (hasVoted) {
      // Remove vote
      await r.srem(walletKey, apiId);
      await r.hincrby(VOTE_COUNTS_KEY, apiId, -1);
      voted = false;
    } else {
      // Add vote
      await r.sadd(walletKey, apiId);
      await r.hincrby(VOTE_COUNTS_KEY, apiId, 1);
      voted = true;
    }
    
    // Get updated state
    const [counts, userVotes] = await Promise.all([
      getVoteCounts(),
      r.smembers(walletKey),
    ]);
    
    return { voted, counts, userVotes };
  } catch (e) {
    console.error('[KV] Failed to toggle vote:', e);
    throw new Error('Failed to save vote');
  }
}

/**
 * Check if Redis is configured and working
 * @returns {Promise<boolean>}
 */
export async function isRedisConnected() {
  const r = getRedis();
  if (!r) return false;
  
  try {
    await r.ping();
    return true;
  } catch {
    return false;
  }
}
