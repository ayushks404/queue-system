import Redis from 'ioredis';
import type { ConnectionOptions } from 'bullmq';

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

function parseBullmqConnection(urlStr: string): ConnectionOptions {
  try {
    const url = new URL(urlStr);
    return {
      host: url.hostname || '127.0.0.1',
      port: Number(url.port) || 6379,
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      tls: url.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null
    } as ConnectionOptions;
  } catch {
    return {
      host: REDIS_HOST,
      port: REDIS_PORT,
      maxRetriesPerRequest: null
    } as ConnectionOptions;
  }
}

export const bullmqConnection = parseBullmqConnection(REDIS_URL);
