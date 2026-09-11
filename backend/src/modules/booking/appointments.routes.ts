import { Router } from 'express';
import { authenticate, requireRole } from '../auth/auth.middleware';
import {
  createAppointment,
  getAppointmentById,
  updateAppointmentStatus,
  cancelAppointment,
  rescheduleAppointment
} from './appointments.controller';

const router = Router();

router.post('/', authenticate, createAppointment);
router.get('/:id', authenticate, getAppointmentById);
router.patch('/:id/status', authenticate, requireRole('STAFF', 'ADMIN'), updateAppointmentStatus);
router.patch('/:id/cancel', authenticate, cancelAppointment);
router.patch('/:id/reschedule', authenticate, rescheduleAppointment);

export default router;
