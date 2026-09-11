import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { createAppointment, getAppointmentById } from './appointments.controller';

const router = Router();

router.post('/', authenticate, createAppointment);
router.get('/:id', authenticate, getAppointmentById);

export default router;
