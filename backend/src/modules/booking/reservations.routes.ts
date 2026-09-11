import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { createReservation } from './reservations.controller';
import { validate } from '../../middleware/validate';
import { createReservationSchema } from '../../middleware/schemas';

const router = Router();

router.post('/', authenticate, validate(createReservationSchema), createReservation);

export default router;
