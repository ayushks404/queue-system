import { Router } from 'express';
import { createBranch, getBranchesAdmin, getBranchById, updateBranch } from './branches.controller';
import { authenticate, requireRole } from '../auth/auth.middleware';

const router = Router();

router.post('/', authenticate, requireRole('ADMIN'), createBranch);
router.get('/admin', authenticate, requireRole('ADMIN'), getBranchesAdmin);
router.get('/:id', authenticate, requireRole('ADMIN'), getBranchById);
router.patch('/:id', authenticate, requireRole('ADMIN'), updateBranch);

export default router;
