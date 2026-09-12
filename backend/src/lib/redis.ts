import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
const REDIS_URL = process.env.REDIS_URL || `redis://${REDIS_HOST}:${REDIS_PORT}`;

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy(times) {
    return Math.min(times * 50, 2000);
  }
});

export function createRedisClient(): Redis {
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: false,
    retryStrategy(times) {
      return Math.min(times * 50, 2000);
    }
  });
}
