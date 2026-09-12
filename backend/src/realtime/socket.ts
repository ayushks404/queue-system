import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { eventBus } from '../events/bus';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

let ioInstance: SocketIOServer | null = null;
let subscribersRegistered = false;

export interface SocketUser {
  id: string;
  email: string;
  role: string;
}

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PATCH', 'DELETE']
    }
  });

  // JWT Authentication Middleware for Socket.IO
  io.use((socket: Socket, next) => {
    try {
      const authHeader =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization;

      if (!authHeader) {
        return next(new Error('UNAUTHORIZED: Authentication token required'));
      }

      const token = authHeader.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : authHeader;

      const decoded = jwt.verify(token, JWT_SECRET!) as unknown as SocketUser;
      socket.data.user = decoded;
      return next();
    } catch (err) {
      return next(new Error('UNAUTHORIZED: Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as SocketUser;

    // Automatically join private user room
    socket.join(`user:${user.id}`);

    // If client supplied branchId in auth payload, join immediately
    const initialBranchId = socket.handshake.auth?.branchId;
    if (initialBranchId) {
      socket.join(`branch:${initialBranchId}`);
    }

    // Allow client to join/leave branch rooms explicitly
    socket.on('join:branch', (data: { branchId: string }) => {
      if (data?.branchId) {
        socket.join(`branch:${data.branchId}`);
      }
    });

    socket.on('leave:branch', (data: { branchId: string }) => {
      if (data?.branchId) {
        socket.leave(`branch:${data.branchId}`);
      }
    });
  });

  ioInstance = io;

  // Register EventBus forwarding to Socket.IO rooms (once)
  if (!subscribersRegistered) {
    eventBus.subscribe('queue.updated', (data) => {
      if (ioInstance && data?.branchId) {
        ioInstance.to(`branch:${data.branchId}`).emit('queue:updated', data);
      }
    });

    eventBus.subscribe('queue.called', (data) => {
      if (ioInstance && data?.branchId) {
        ioInstance.to(`branch:${data.branchId}`).emit('queue:called', data);
      }
    });

    eventBus.subscribe('notification.created', (data) => {
      if (ioInstance && data?.userId) {
        ioInstance.to(`user:${data.userId}`).emit('notification:new', data);
      }
    });

    eventBus.subscribe('appointment.confirmed', (data) => {
      if (ioInstance && data?.branchId) {
        ioInstance.to(`branch:${data.branchId}`).emit('appointment:updated', data);
      }
    });

    eventBus.subscribe('appointment.cancelled', (data) => {
      if (ioInstance && data?.branchId) {
        ioInstance.to(`branch:${data.branchId}`).emit('appointment:updated', data);
      }
    });

    subscribersRegistered = true;
  }

  return io;
}

export function getIO(): SocketIOServer | null {
  return ioInstance;
}

export async function closeIO(): Promise<void> {
  if (ioInstance) {
    await new Promise<void>((resolve) => {
      ioInstance!.close(() => resolve());
    });
    ioInstance = null;
  }
}
