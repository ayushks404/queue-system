import { Router } from 'express';
import { authenticate, requireRole } from '../auth/auth.middleware';
import {
  createWalkIn,
  updateQueueStatus,
  callNext,
  getBranchQueue
} from './queue.controller';
import { validate } from '../../middleware/validate';
import { walkInQueueSchema, updateStatusSchema } from '../../middleware/schemas';

const router = Router();

router.post('/walk-in', authenticate, requireRole('STAFF', 'ADMIN'), validate(walkInQueueSchema), createWalkIn);
router.patch('/:id/status', authenticate, requireRole('STAFF', 'ADMIN'), validate(updateStatusSchema), updateQueueStatus);
router.post('/:branchId/call-next', authenticate, requireRole('STAFF', 'ADMIN'), callNext);
router.get('/:branchId', authenticate, requireRole('STAFF', 'ADMIN'), getBranchQueue);
router.get('/branch/:branchId', authenticate, requireRole('STAFF', 'ADMIN'), getBranchQueue);

export default router;
