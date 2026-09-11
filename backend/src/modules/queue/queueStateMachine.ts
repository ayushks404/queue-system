export type QueueStatus =
  | 'WAITING'
  | 'CALLED'
  | 'IN_PROGRESS'
  | 'SKIPPED'
  | 'COMPLETED'
  | 'CANCELLED';

export function normalizeQueueStatus(status: string): QueueStatus {
  const upper = status.trim().toUpperCase().replace(/[\s-]/g, '_');
  if (upper === 'INPROGRESS') return 'IN_PROGRESS';
  return upper as QueueStatus;
}

export const VALID_QUEUE_TRANSITIONS: Record<QueueStatus, QueueStatus[]> = {
  WAITING: ['CALLED', 'CANCELLED'],
  CALLED: ['IN_PROGRESS', 'SKIPPED', 'CANCELLED', 'WAITING'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  SKIPPED: ['WAITING', 'CALLED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: []
};

export function canQueueTransition(from: string, to: string): boolean {
  try {
    const fromNorm = normalizeQueueStatus(from);
    const toNorm = normalizeQueueStatus(to);

    const allowed = VALID_QUEUE_TRANSITIONS[fromNorm];
    if (!allowed) {
      return false;
    }

    return allowed.includes(toNorm);
  } catch {
    return false;
  }
}
