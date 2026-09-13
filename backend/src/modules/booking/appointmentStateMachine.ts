export type AppointmentStatus =
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export function normalizeStatus(status: string): AppointmentStatus {
  const upper = status.trim().toUpperCase().replace(/[\s-]/g, '_');
  if (upper === 'CHECKEDIN') return 'CHECKED_IN';
  if (upper === 'INPROGRESS') return 'IN_PROGRESS';
  if (upper === 'NOSHOW') return 'NO_SHOW';
  return upper as AppointmentStatus;
}

export const VALID_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['IN_PROGRESS', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: []
};

export function canTransition(from: string, to: string): boolean {
  try {
    const fromNorm = normalizeStatus(from);
    const toNorm = normalizeStatus(to);

    if (fromNorm === toNorm) {
      return true;
    }

    const allowed = VALID_TRANSITIONS[fromNorm];
    if (!allowed) {
      return false;
    }

    return allowed.includes(toNorm);
  } catch {
    return false;
  }
}
