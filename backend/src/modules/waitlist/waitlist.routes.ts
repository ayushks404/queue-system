import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import {
  joinWaitlist,
  getWaitlistPosition,
  getUserWaitlists,
  cancelWaitlistEntry
} from './waitlist.controller';

const router = Router();

router.post('/', authenticate, joinWaitlist);
router.get('/', authenticate, getUserWaitlists);
router.get('/:id/position', authenticate, getWaitlistPosition);
router.patch('/:id/cancel', authenticate, cancelWaitlistEntry);

export default router;
