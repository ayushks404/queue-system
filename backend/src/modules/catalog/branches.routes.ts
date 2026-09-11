import { Router } from 'express';
import { createBranch, getBranchesAdmin, getBranchById, updateBranch } from './branches.controller';
import { setBusinessHours, getBusinessHours, createHoliday, getHolidays, deleteHoliday } from './schedules.controller';
import { authenticate, requireRole } from '../auth/auth.middleware';

const router = Router();

// Branch endpoints
router.post('/', authenticate, requireRole('ADMIN'), createBranch);
router.get('/admin', authenticate, requireRole('ADMIN'), getBranchesAdmin);
router.get('/:id', authenticate, requireRole('ADMIN'), getBranchById);
router.patch('/:id', authenticate, requireRole('ADMIN'), updateBranch);

// Schedule & Holiday endpoints per branch
router.post('/:branchId/business-hours', authenticate, requireRole('ADMIN'), setBusinessHours);
router.get('/:branchId/business-hours', authenticate, requireRole('ADMIN'), getBusinessHours);
router.post('/:branchId/holidays', authenticate, requireRole('ADMIN'), createHoliday);
router.get('/:branchId/holidays', authenticate, requireRole('ADMIN'), getHolidays);
router.delete('/:branchId/holidays/:holidayId', authenticate, requireRole('ADMIN'), deleteHoliday);

export default router;
