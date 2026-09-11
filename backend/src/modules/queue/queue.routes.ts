import { Router } from 'express';
import { authenticate, requireRole } from '../auth/auth.middleware';
import {
  createWalkIn,
  updateQueueStatus,
  callNext,
  getBranchQueue
} from './queue.controller';

const router = Router();

router.post('/walk-in', authenticate, requireRole('STAFF', 'ADMIN'), createWalkIn);
router.patch('/:id/status', authenticate, requireRole('STAFF', 'ADMIN'), updateQueueStatus);
router.post('/:branchId/call-next', authenticate, requireRole('STAFF', 'ADMIN'), callNext);
router.get('/:branchId', authenticate, getBranchQueue);

export default router;
