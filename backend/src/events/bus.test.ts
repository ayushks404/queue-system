import test from 'node:test';
import assert from 'node:assert';
import { publish, subscribe, clearAllSubscriptions } from './bus';

test('throwaway event bus pub/sub test', async () => {
  clearAllSubscriptions();
  let receivedPayload: any = null;

  subscribe('test.event', (payload) => {
    receivedPayload = payload;
  });

  publish('test.event', { message: 'hello event bus' });

  assert.deepStrictEqual(receivedPayload, { message: 'hello event bus' });
});
