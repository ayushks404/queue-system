import { Router } from 'express';
import { authenticate, requireRole } from '../auth/auth.middleware';
import {
  createAppointment,
  getAppointmentById,
  updateAppointmentStatus,
  cancelAppointment,
  rescheduleAppointment
} from './appointments.controller';
import { validate } from '../../middleware/validate';
import {
  createAppointmentSchema,
  cancelAppointmentSchema,
  rescheduleAppointmentSchema,
  updateStatusSchema
} from '../../middleware/schemas';

const router = Router();

router.post('/', authenticate, validate(createAppointmentSchema), createAppointment);
router.get('/:id', authenticate, getAppointmentById);
router.patch('/:id/status', authenticate, requireRole('STAFF', 'ADMIN'), validate(updateStatusSchema), updateAppointmentStatus);
router.patch('/:id/cancel', authenticate, validate(cancelAppointmentSchema), cancelAppointment);
router.patch('/:id/reschedule', authenticate, validate(rescheduleAppointmentSchema), rescheduleAppointment);

export default router;
