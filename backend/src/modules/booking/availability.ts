export interface BusinessHourInput {
  day_of_week: number;
  open_time: string;
  close_time: string;
  break_start?: string | null;
  break_end?: string | null;
}

export interface BranchAvailabilityInput {
  id?: string;
  business_hours?: BusinessHourInput[];
  businessHours?: BusinessHourInput[];
  holidays?: Array<{ holiday_date: string | Date } | string | Date>;
}

export interface ServiceAvailabilityInput {
  id?: string;
  duration_minutes: number;
  capacity?: number;
}

export interface AppointmentSlotInput {
  start_time?: string;
  slot_time?: string;
  status?: string;
}

export interface HolidayInput {
  holiday_date?: string | Date;
}

function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function normalizeDateStr(date: string | Date): string {
  if (typeof date === 'string') {
    return date.split('T')[0];
  }
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDayOfWeek(date: string | Date): number {
  if (typeof date === 'string') {
    // Parse YYYY-MM-DD in UTC to avoid local timezone offset shifts
    const [year, month, day] = date.split('T')[0].split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    return d.getUTCDay();
  }
  return date.getUTCDay();
}

export function computeAvailableSlots(
  branch: BranchAvailabilityInput,
  service: ServiceAvailabilityInput,
  date: string | Date,
  existingAppointments: AppointmentSlotInput[] = [],
  holidays: Array<HolidayInput | string | Date> = []
): string[] {
  const targetDateStr = normalizeDateStr(date);

  // Check holidays from branch or separate holidays array
  const allHolidays = [...(holidays || []), ...(branch.holidays || [])];
  const isHoliday = allHolidays.some((h) => {
    const hDate = typeof h === 'string' || h instanceof Date ? h : h.holiday_date;
    if (!hDate) return false;
    return normalizeDateStr(hDate) === targetDateStr;
  });

  if (isHoliday) {
    return [];
  }

  const dayOfWeek = getDayOfWeek(date);
  const rawHours = branch.business_hours || branch.businessHours || [];
  const businessHours: BusinessHourInput[] = rawHours.length > 0
    ? rawHours
    : [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        day_of_week: d,
        open_time: '09:00',
        close_time: '17:00',
        break_start: null,
        break_end: null,
      }));

  const todayHours = businessHours.find((bh) => bh.day_of_week === dayOfWeek);

  if (!todayHours) {
    return [];
  }

  const openMinutes = timeToMinutes(todayHours.open_time);
  const closeMinutes = timeToMinutes(todayHours.close_time);
  const duration = service.duration_minutes;
  const capacity = service.capacity && service.capacity > 0 ? service.capacity : 1;

  const hasBreak = todayHours.break_start && todayHours.break_end;
  const breakStartMinutes = hasBreak ? timeToMinutes(todayHours.break_start!) : -1;
  const breakEndMinutes = hasBreak ? timeToMinutes(todayHours.break_end!) : -1;

  // Count active existing appointments/reservations per slot
  const slotCounts: Record<string, number> = {};
  for (const appt of existingAppointments) {
    if (appt.status && appt.status.toUpperCase() === 'CANCELLED') {
      continue;
    }
    const slotTime = appt.start_time || appt.slot_time;
    if (slotTime) {
      // Normalize slot time format (e.g., "09:00:00" -> "09:00")
      const normalizedSlot = slotTime.slice(0, 5);
      slotCounts[normalizedSlot] = (slotCounts[normalizedSlot] || 0) + 1;
    }
  }

  const availableSlots: string[] = [];

  for (let slotStart = openMinutes; slotStart + duration <= closeMinutes; slotStart += duration) {
    const slotEnd = slotStart + duration;

    // Check break overlap: slot overlaps break if slotStart < breakEnd && slotEnd > breakStart
    if (hasBreak) {
      if (slotStart < breakEndMinutes && slotEnd > breakStartMinutes) {
        continue;
      }
    }

    const slotTimeStr = minutesToTime(slotStart);
    const bookedCount = slotCounts[slotTimeStr] || 0;

    if (bookedCount < capacity) {
      availableSlots.push(slotTimeStr);
    }
  }

  return availableSlots;
}
