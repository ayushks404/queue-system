export type UserRole = 'CUSTOMER' | 'STAFF' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  role: UserRole;
  created_at: string;
}

export interface Branch {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  timezone?: string;
  is_active: boolean;
  created_at: string;
  business_hours?: BusinessHour[];
  holidays?: Holiday[];
}

export interface BusinessHour {
  id?: string;
  branch_id?: string;
  day_of_week: number; // 0 = Sunday, 1 = Monday, ...
  open_time: string; // HH:mm
  close_time: string; // HH:mm
}

export interface Holiday {
  id?: string;
  branch_id?: string;
  holiday_date: string; // YYYY-MM-DD
  reason?: string;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
  duration_minutes: number;
  buffer_time_minutes: number;
  price?: number;
  capacity: number;
  is_active: boolean;
  service_resources?: { resource_id: string; resource?: Resource }[];
}

export interface Resource {
  id: string;
  branch_id: string;
  name: string;
  type: string;
  is_active: boolean;
  branch?: Branch;
}

export interface Slot {
  slot_time: string; // HH:mm
  available: boolean;
  remaining_capacity: number;
}

export interface AvailabilityResponse {
  branch_id: string;
  service_id: string;
  date: string;
  available_slots: string[];
  slots?: Slot[];
}

export interface Reservation {
  id: string;
  branch_id: string;
  service_id: string;
  slot_date: string;
  slot_time: string;
  expires_at: string;
  user_id: string;
}

export type AppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_SERVICE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface Appointment {
  id: string;
  appointment_number: string;
  user_id: string;
  branch_id: string;
  service_id: string;
  appointment_date?: string;
  start_time?: string;
  end_time?: string;
  slot_date?: string;
  slot_time?: string;
  status: AppointmentStatus;
  notes?: string;
  created_at: string;
  updated_at?: string;
  user?: User;
  branch?: Branch;
  service?: Service;
}

export type QueuePriority = 'NORMAL' | 'PRIORITY' | 'EMERGENCY';
export type QueueStatus = 'WAITING' | 'CALLED' | 'SERVING' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED';

export interface QueueEntry {
  id: string;
  branch_id: string;
  service_id?: string;
  customer_name: string;
  customer_phone?: string;
  queue_number: number;
  priority: QueuePriority;
  status: QueueStatus;
  called_at?: string;
  served_at?: string;
  completed_at?: string;
  created_at: string;
  service?: Service;
}

export type WaitlistStatus = 'WAITING' | 'OFFERED' | 'CONVERTED' | 'EXPIRED' | 'CANCELLED';

export interface WaitlistEntry {
  id: string;
  user_id: string;
  branch_id: string;
  service_id: string;
  preferred_date: string;
  status: WaitlistStatus;
  offered_at?: string;
  offer_expires_at?: string;
  created_at: string;
  position?: number;
  branch?: Branch;
  service?: Service;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  is_read: boolean;
  created_at: string;
}
