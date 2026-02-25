import Redis from 'ioredis';
import { logger } from './logger.js';

const IS_PROD = process.env.NODE_ENV === 'production';

let redis = null;
let redisHealthy = false;

function getRedis() {
  if (redis) return redis;

  const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
  if (!redisUrl) {
    if (IS_PROD) {
      logger.error('REDIS_URL is required in production');
      process.exit(1);
    }
    return null;
  }

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
    });

    redis.on('error', (err) => {
      redisHealthy = false;
      logger.error('Redis connection error', { err: err.message });
    });
    redis.on('ready', () => { redisHealthy = true; });
    redis.on('close', () => { redisHealthy = false; });
  } catch (e) {
    logger.error('Redis connection failed', { err: e.message });
    if (IS_PROD) process.exit(1);
    return null;
  }

  return redis;
}

function isRedisHealthy() {
  return redisHealthy;
}

export { getRedis, isRedisHealthy };
