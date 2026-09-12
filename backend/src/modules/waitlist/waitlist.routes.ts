import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import {
  joinWaitlist,
  getWaitlistPosition,
  getUserWaitlists,
  cancelWaitlistEntry,
  acceptWaitlistOffer
} from './waitlist.controller';
import { validate } from '../../middleware/validate';
import { createWaitlistSchema } from '../../middleware/schemas';
import { bookingLimiter } from '../../middleware/rateLimiter';

const router = Router();

router.post('/', bookingLimiter, authenticate, validate(createWaitlistSchema), joinWaitlist);
router.get('/', authenticate, getUserWaitlists);
router.get('/me', authenticate, getUserWaitlists);
router.get('/:id/position', authenticate, getWaitlistPosition);
router.post('/:id/accept', authenticate, acceptWaitlistOffer);
router.patch('/:id/cancel', authenticate, cancelWaitlistEntry);

export default router;
