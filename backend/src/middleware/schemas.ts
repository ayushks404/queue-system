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
  address: z.string().min(1, 'Address is required'),
  phone: z.string().min(1, 'Phone is required'),
});

export const updateBranchSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  is_active: z.boolean().optional(),
});

export const createServiceSchema = z.object({
  name: z.string().min(1, 'Service name is required'),
  description: z.string().optional(),
  duration_minutes: z.number().int().positive('Duration must be positive integer'),
  price: z.number().nonnegative().optional(),
  capacity: z.number().int().positive().optional(),
  buffer_time_minutes: z.number().int().nonnegative().optional(),
  is_active: z.boolean().optional(),
});

export const updateServiceSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  duration_minutes: z.number().int().positive().optional(),
  price: z.number().nonnegative().optional(),
  capacity: z.number().int().positive().optional(),
  buffer_time_minutes: z.number().int().nonnegative().optional(),
  is_active: z.boolean().optional(),
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
}).refine(
  (data) => (data.branch_id || data.branchId) && (data.service_id || data.serviceId) && (data.slot_date || data.slotDate) && (data.slot_time || data.slotTime),
  { message: 'branch_id, service_id, slot_date, and slot_time are required' }
);

export const createAppointmentSchema = z.object({
  reservation_id: z.string().optional(),
  reservationId: z.string().optional(),
  notes: z.string().optional(),
  idempotency_key: z.string().optional(),
  idempotencyKey: z.string().optional(),
}).refine(
  (data) => data.reservation_id || data.reservationId,
  { message: 'reservation_id or reservationId is required' }
);

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
  new_branch_id: z.string().uuid().optional(),
  newBranchId: z.string().uuid().optional(),
  new_service_id: z.string().uuid().optional(),
  newServiceId: z.string().uuid().optional(),
}).refine(
  (data) => (data.new_slot_date || data.newSlotDate || data.slot_date || data.slotDate) && (data.new_slot_time || data.newSlotTime || data.slot_time || data.slotTime),
  { message: 'new_slot_date and new_slot_time are required' }
);

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
}).refine(
  (data) => (data.branch_id || data.branchId) && (data.service_id || data.serviceId) && (data.customer_name || data.customerName),
  { message: 'branch_id, service_id, and customer_name are required' }
);

// Waitlist Schemas
export const createWaitlistSchema = z.object({
  branch_id: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  service_id: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  preferred_date: z.string().optional(),
  preferredDate: z.string().optional(),
  requested_date: z.string().optional(),
  requestedDate: z.string().optional(),
  date: z.string().optional(),
  requested_time: z.string().optional(),
  requestedTime: z.string().optional(),
  preferred_time: z.string().optional(),
  preferredTime: z.string().optional(),
  time: z.string().optional(),
}).refine(
  (data) => (data.branch_id || data.branchId) && (data.service_id || data.serviceId) && (data.preferred_date || data.preferredDate || data.requested_date || data.requestedDate || data.date),
  { message: 'branch_id, service_id, and requested_date are required' }
);
