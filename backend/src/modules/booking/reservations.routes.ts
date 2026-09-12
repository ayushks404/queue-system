import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { createReservation } from './reservations.controller';
import { validate } from '../../middleware/validate';
import { createReservationSchema } from '../../middleware/schemas';
import { bookingLimiter } from '../../middleware/rateLimiter';

const router = Router();

router.post('/', bookingLimiter, authenticate, validate(createReservationSchema), createReservation);

export default router;
