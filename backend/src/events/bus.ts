// This is the only mechanism modules are allowed to use to trigger side effects in another module
import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { createRedisClient } from '../lib/redis';

const eventEmitter = new EventEmitter();
const instanceId = Math.random().toString(36).substring(2) + '-' + Date.now().toString(36);
const CHANNEL = 'app-events';

let pubClient: Redis | null = null;
let subClient: Redis | null = null;
let isRedisInitialized = false;

export type EventHandler<T = any> = (payload: T) => void | Promise<void>;

export function initEventBusRedis(): void {
  if (isRedisInitialized) return;
  try {
    pubClient = createRedisClient();
    subClient = createRedisClient();

    pubClient.on('error', (err) => {
      // Suppress noisy logs during local tests where Redis isn't running
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[EventBus] Redis Pub client warning:', err.message);
      }
    });

    subClient.on('error', (err) => {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[EventBus] Redis Sub client warning:', err.message);
      }
    });

    subClient.subscribe(CHANNEL, (err) => {
      if (err) {
        if (process.env.NODE_ENV !== 'test') {
          console.error('[EventBus] Failed to subscribe to Redis channel:', err);
        }
      } else if (process.env.NODE_ENV !== 'test') {
        console.log(`[EventBus] Subscribed to Redis channel: ${CHANNEL}`);
      }
    });

    subClient.on('message', (channel, message) => {
      if (channel === CHANNEL) {
        try {
          const parsed = JSON.parse(message);
          if (parsed && parsed.senderId !== instanceId && parsed.event) {
            eventEmitter.emit(parsed.event, parsed.payload);
          }
        } catch (err) {
          console.error('[EventBus] Error parsing Redis pub/sub message:', err);
        }
      }
    });

    isRedisInitialized = true;
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[EventBus] Redis pub/sub init error:', err);
    }
  }
}

export async function closeEventBusRedis(): Promise<void> {
  if (subClient) {
    try {
      await subClient.unsubscribe(CHANNEL);
      await subClient.quit();
    } catch {}
    subClient = null;
  }
  if (pubClient) {
    try {
      await pubClient.quit();
    } catch {}
    pubClient = null;
  }
  isRedisInitialized = false;
}

export function publish<T = any>(event: string, payload: T): void {
  eventEmitter.emit(event, payload);

  if (pubClient && pubClient.status === 'ready') {
    const message = JSON.stringify({
      senderId: instanceId,
      event,
      payload
    });
    pubClient.publish(CHANNEL, message).catch((err) => {
      if (process.env.NODE_ENV !== 'test') {
        console.error(`[EventBus] Failed to publish event ${event} to Redis:`, err);
      }
    });
  }
}

export function subscribe<T = any>(event: string, handler: EventHandler<T>): () => void {
  eventEmitter.on(event, handler);
  return () => {
    eventEmitter.off(event, handler);
  };
}

export function clearAllSubscriptions(): void {
  eventEmitter.removeAllListeners();
}

export const eventBus = {
  publish,
  subscribe,
  clearAllSubscriptions,
  initEventBusRedis,
  closeEventBusRedis
};
