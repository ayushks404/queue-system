// This is the only mechanism modules are allowed to use to trigger side effects in another module
import { EventEmitter } from 'events';

const eventEmitter = new EventEmitter();

export type EventHandler<T = any> = (payload: T) => void | Promise<void>;

export function publish<T = any>(event: string, payload: T): void {
  eventEmitter.emit(event, payload);
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
