import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { eventBus } from '../../events/bus';
import { canQueueTransition, normalizeQueueStatus } from './queueStateMachine';

function getPriorityRank(priority: string): number {
  const norm = priority.trim().toUpperCase();
  if (norm === 'EMERGENCY') return 3;
  if (norm === 'PRIORITY') return 2;
  return 1; // NORMAL
}

export async function createWalkIn(req: Request, res: Response): Promise<void> {
  try {
    const branchId = req.body.branchId || req.body.branch_id;
    const customerName = req.body.customerName || req.body.customer_name || req.body.name;
    const phone = req.body.phone || req.body.customer_phone;
    const priority = (req.body.priority || 'NORMAL').toUpperCase();
    const appointmentId = req.body.appointmentId || req.body.appointment_id || null;

    if (!branchId || !customerName) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'branchId and customerName are required'
        }
      });
      return;
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId }
    });

    if (!branch || !branch.is_active) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Branch not found or inactive'
        }
      });
      return;
    }

    const priorityRank = getPriorityRank(priority);

    // Calculate sequential queue_number for branch today (UTC start of day)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const queueEntry = await prisma.$transaction(async (tx) => {
      // Serialize walk-in number allocation per branch
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${branchId} || ':walkin-queue-number'))`;

      const latestToday = await tx.queueEntry.findFirst({
        where: {
          branch_id: branchId,
          created_at: { gte: todayStart }
        },
        orderBy: { queue_number: 'desc' }
      });

      const nextNumber = (latestToday?.queue_number || 0) + 1;

      return await tx.queueEntry.create({
        data: {
          branch_id: branchId,
          customer_name: customerName,
          phone: phone || null,
          priority,
          priority_rank: priorityRank,
          queue_number: nextNumber,
          status: 'WAITING',
          appointment_id: appointmentId
        }
      });
    });

    eventBus.publish('queue.updated', {
      branchId,
      queueEntryId: queueEntry.id,
      status: queueEntry.status,
      queueNumber: queueEntry.queue_number
    });

    res.status(201).json({
      success: true,
      data: queueEntry
    });
  } catch (error) {
    console.error('Error creating walk-in queue entry:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create queue entry'
      }
    });
  }
}

export async function updateQueueStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'status is required'
        }
      });
      return;
    }

    const entry = await prisma.queueEntry.findUnique({
      where: { id }
    });

    if (!entry) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Queue entry not found'
        }
      });
      return;
    }

    const nextStatus = normalizeQueueStatus(status);
    if (!canQueueTransition(entry.status, nextStatus)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS_TRANSITION',
          message: `Invalid queue status transition from ${entry.status} to ${nextStatus}`
        }
      });
      return;
    }

    const updated = await prisma.queueEntry.update({
      where: { id },
      data: { status: nextStatus }
    });

    eventBus.publish('queue.updated', {
      branchId: updated.branch_id,
      queueEntryId: updated.id,
      status: updated.status,
      queueNumber: updated.queue_number
    });

    res.status(200).json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('Error updating queue status:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update queue status'
      }
    });
  }
}

async function notifyQueuePositionsChanged(branchId: string): Promise<void> {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const waitingEntries = await prisma.queueEntry.findMany({
      where: {
        branch_id: branchId,
        created_at: { gte: todayStart },
        status: 'WAITING'
      },
      include: {
        appointment: {
          select: { user_id: true }
        }
      },
      orderBy: [
        { priority_rank: 'desc' },
        { created_at: 'asc' }
      ]
    });

    waitingEntries.forEach((entry, index) => {
      const position = index + 1;
      const userId = entry.appointment?.user_id;
      if (userId) {
        eventBus.publish('queue.position_changed', {
          userId,
          queueEntryId: entry.id,
          position,
          queueNumber: entry.queue_number
        });
      }
    });
  } catch (err) {
    console.error('Error broadcasting queue position changes:', err);
  }
}

export async function callNext(req: Request, res: Response): Promise<void> {
  try {
    const { branchId } = req.params;

    if (!branchId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'branchId is required'
        }
      });
      return;
    }

    const calledEntry = await prisma.$transaction(async (tx) => {
      // Priority tier first (DESC: EMERGENCY=3 > PRIORITY=2 > NORMAL=1), then FIFO (created_at ASC)
      // FOR UPDATE SKIP LOCKED ensures concurrency safety without blocking concurrent staff calls
      const entries: any[] = await tx.$queryRaw`
        SELECT * FROM "queue_entries"
        WHERE "branch_id" = ${branchId}::uuid AND "status" = 'WAITING'
        ORDER BY "priority_rank" DESC, "created_at" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;

      if (!entries || entries.length === 0) {
        return null;
      }

      const nextEntry = entries[0];

      // Update status to CALLED
      const updated = await tx.queueEntry.update({
        where: { id: nextEntry.id },
        data: { status: 'CALLED' },
        include: {
          appointment: { select: { user_id: true } }
        }
      });

      return updated;
    });

    if (!calledEntry) {
      res.status(200).json({
        success: true,
        data: null,
        message: 'No customers waiting in queue'
      });
      return;
    }

    eventBus.publish('queue.called', {
      branchId,
      queueEntryId: calledEntry.id,
      queueNumber: calledEntry.queue_number,
      customerName: calledEntry.customer_name,
      userId: calledEntry.appointment?.user_id
    });

    eventBus.publish('queue.updated', {
      branchId,
      queueEntryId: calledEntry.id,
      status: 'CALLED',
      queueNumber: calledEntry.queue_number
    });

    await notifyQueuePositionsChanged(branchId);

    res.status(200).json({
      success: true,
      data: calledEntry
    });
  } catch (error) {
    console.error('Error calling next queue customer:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to call next queue customer'
      }
    });
  }
}

export async function getBranchQueue(req: Request, res: Response): Promise<void> {
  try {
    const { branchId } = req.params;
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const queue = await prisma.queueEntry.findMany({
      where: {
        branch_id: branchId,
        created_at: { gte: todayStart },
        status: { in: ['WAITING', 'CALLED', 'IN_PROGRESS'] }
      },
      orderBy: [
        { priority_rank: 'desc' },
        { created_at: 'asc' }
      ]
    });

    res.status(200).json({
      success: true,
      data: queue
    });
  } catch (error) {
    console.error('Error fetching branch queue:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch branch queue'
      }
    });
  }
}
