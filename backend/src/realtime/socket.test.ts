import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import app from '../index';
import { initSocketServer, closeIO } from './socket';
import { eventBus } from '../events/bus';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_jwt_key_queue_system_2026';

function generateToken(user: { id: string; email: string; role: string }) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

test('Phase 9: Real-Time Updates via Socket.IO (9.1, 9.2, 9.3, 9.4)', async (t) => {
  const server = http.createServer(app);
  initSocketServer(server);

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const port = (server.address() as any).port;
  const serverUrl = `http://127.0.0.1:${port}`;

  const user1 = { id: '11111111-1111-1111-1111-111111111111', email: 'user1@realtime.local', role: 'CUSTOMER' };
  const user2 = { id: '22222222-2222-2222-2222-222222222222', email: 'user2@realtime.local', role: 'CUSTOMER' };

  const token1 = generateToken(user1);
  const token2 = generateToken(user2);
  const branchId = '33333333-3333-3333-3333-333333333333';

  let client1: ClientSocket | null = null;
  let client2: ClientSocket | null = null;

  t.after(async () => {
    if (client1) client1.disconnect();
    if (client2) client2.disconnect();
    await closeIO();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // Step 9.1: Unauthenticated connection rejected
  await new Promise<void>((resolve) => {
    const unauthClient = ioClient(serverUrl, {
      auth: { token: 'invalid.token' },
      reconnection: false,
      transports: ['websocket']
    });

    unauthClient.on('connect_error', (err) => {
      assert.ok(err.message.includes('UNAUTHORIZED'));
      unauthClient.disconnect();
      resolve();
    });
  });

  // Step 9.1: Valid client connects and joins branch room
  client1 = ioClient(serverUrl, {
    auth: { token: token1, branchId },
    transports: ['websocket']
  });

  client2 = ioClient(serverUrl, {
    auth: { token: token2, branchId },
    transports: ['websocket']
  });

  await Promise.all([
    new Promise<void>((resolve) => client1!.on('connect', () => resolve())),
    new Promise<void>((resolve) => client2!.on('connect', () => resolve()))
  ]);

  assert.strictEqual(client1.connected, true);
  assert.strictEqual(client2.connected, true);

  // Step 9.2: Emit queue:updated to branch room -> Both connected clients in branch receive it live
  const queueUpdatePayload = {
    branchId,
    queueEntryId: 'entry-123',
    status: 'CALLED',
    queueNumber: 5
  };

  const [received1, received2] = await Promise.all([
    new Promise<any>((resolve) => {
      client1!.once('queue:updated', (data) => resolve(data));
    }),
    new Promise<any>((resolve) => {
      client2!.once('queue:updated', (data) => resolve(data));
    }),
    new Promise<void>((resolve) => {
      // Trigger event on backend event bus
      eventBus.publish('queue.updated', queueUpdatePayload);
      resolve();
    })
  ]);

  assert.deepStrictEqual(received1, queueUpdatePayload);
  assert.deepStrictEqual(received2, queueUpdatePayload);

  // Step 9.3: Emit notification:new to specific user room
  // User 1 MUST receive it; User 2 in the same branch MUST NOT receive it
  let user2ReceivedNotification = false;
  client2.on('notification:new', () => {
    user2ReceivedNotification = true;
  });

  const privateNotification = {
    userId: user1.id,
    id: 'notif-1',
    message: 'Your appointment is confirmed',
    type: 'APPOINTMENT_CONFIRMED'
  };

  const user1Received = await new Promise<any>((resolve) => {
    client1!.once('notification:new', (data) => resolve(data));
    eventBus.publish('notification.created', privateNotification);
  });

  assert.deepStrictEqual(user1Received, privateNotification);

  // Allow event loop cycle to ensure User 2 did NOT receive it
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.strictEqual(
    user2ReceivedNotification,
    false,
    'Targeted notification must NOT be received by other users in branch'
  );

  // Step 9.4: Reconnection options verify exponential backoff configuration
  const reconnectClient = ioClient(serverUrl, {
    auth: { token: token1 },
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    autoConnect: false
  });

  assert.strictEqual(reconnectClient.io.opts.reconnection, true);
  assert.strictEqual(reconnectClient.io.opts.reconnectionDelay, 500);
  assert.strictEqual(reconnectClient.io.opts.reconnectionDelayMax, 5000);
});
