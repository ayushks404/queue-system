import { Router } from 'express';
import { authenticate, requireRole } from '../auth/auth.middleware';
import { listUsers, updateUserRole } from './users.controller';

const router = Router();

router.get('/', authenticate, requireRole('ADMIN'), listUsers);
router.patch('/:id/role', authenticate, requireRole('ADMIN'), updateUserRole);

export default router;
