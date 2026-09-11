import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { createReservation } from './reservations.controller';

const router = Router();

router.post('/', authenticate, createReservation);

export default router;
