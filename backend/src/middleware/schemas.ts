import { z } from 'zod';

// Auth Schemas
export const registerSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().optional(),
  phone: z.string().optional(),
  role: z.enum(['CUSTOMER', 'STAFF', 'ADMIN']).optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refresh_token: z.string().optional(),
  refreshToken: z.string().optional(),
}).refine((data) => data.refresh_token || data.refreshToken, {
  message: 'refresh_token or refreshToken is required',
});

// Catalog Schemas
export const createBranchSchema = z.object({
  name: z.string().min(1, 'Branch name is required'),
  address: z.string().optional(),
  phone: z.string().optional(),
  timezone: z.string().optional(),
});

export const createServiceSchema = z.object({
  name: z.string().min(1, 'Service name is required'),
  duration_minutes: z.number().int().positive('Duration must be positive integer'),
  price: z.number().nonnegative().optional(),
  capacity: z.number().int().positive().optional(),
  buffer_time_minutes: z.number().int().nonnegative().optional(),
});

// Booking Schemas
export const createReservationSchema = z.object({
  branch_id: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  service_id: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  slot_date: z.string().optional(),
  slotDate: z.string().optional(),
  slot_time: z.string().optional(),
  slotTime: z.string().optional(),
});

export const createAppointmentSchema = z.object({
  reservation_id: z.string().optional(),
  reservationId: z.string().optional(),
  notes: z.string().optional(),
  idempotency_key: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export const cancelAppointmentSchema = z.object({
  reason: z.string().optional(),
});

export const rescheduleAppointmentSchema = z.object({
  new_slot_date: z.string().optional(),
  newSlotDate: z.string().optional(),
  new_slot_time: z.string().optional(),
  newSlotTime: z.string().optional(),
  slot_date: z.string().optional(),
  slotDate: z.string().optional(),
  slot_time: z.string().optional(),
  slotTime: z.string().optional(),
});

export const updateStatusSchema = z.object({
  status: z.string().min(1, 'Status is required'),
});

// Queue Schemas
export const walkInQueueSchema = z.object({
  branch_id: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  service_id: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  customer_name: z.string().min(1, 'Customer name is required').optional(),
  customerName: z.string().min(1, 'Customer name is required').optional(),
  phone: z.string().optional(),
  customer_phone: z.string().optional(),
  priority: z.enum(['NORMAL', 'PRIORITY', 'EMERGENCY']).optional(),
});

// Waitlist Schemas
export const createWaitlistSchema = z.object({
  branch_id: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  service_id: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  preferred_date: z.string().optional(),
  preferredDate: z.string().optional(),
});
