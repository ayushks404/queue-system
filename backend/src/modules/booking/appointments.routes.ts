import { Router } from 'express';
import { authenticate, requireRole } from '../auth/auth.middleware';
import {
  createAppointment,
  listAppointments,
  getAppointmentById,
  updateAppointmentStatus,
  cancelAppointment,
  rescheduleAppointment
} from './appointments.controller';
import { validate } from '../../middleware/validate';
import { bookingLimiter } from '../../middleware/rateLimiter';
import {
  createAppointmentSchema,
  cancelAppointmentSchema,
  rescheduleAppointmentSchema,
  updateStatusSchema
} from '../../middleware/schemas';

const router = Router();

router.post('/', authenticate, bookingLimiter, validate(createAppointmentSchema), createAppointment);
router.get('/', authenticate, listAppointments);
router.get('/:id', authenticate, getAppointmentById);
router.patch('/:id/status', authenticate, requireRole('STAFF', 'ADMIN'), validate(updateStatusSchema), updateAppointmentStatus);
router.patch('/:id/cancel', authenticate, validate(cancelAppointmentSchema), cancelAppointment);
router.patch('/:id/reschedule', authenticate, validate(rescheduleAppointmentSchema), rescheduleAppointment);

export default router;
