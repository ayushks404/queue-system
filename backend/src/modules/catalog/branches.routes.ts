import { Router } from 'express';
import { getActiveBranches, createBranch, getBranchesAdmin, getBranchById, updateBranch } from './branches.controller';
import { setBusinessHours, getBusinessHours, createHoliday, getHolidays, deleteHoliday } from './schedules.controller';
import { createResource, getResourcesByBranch } from './resources.controller';
import { authenticate, requireRole } from '../auth/auth.middleware';
import { validate } from '../../middleware/validate';
import { createBranchSchema, updateBranchSchema } from '../../middleware/schemas';

const router = Router();

// Public endpoint (Active branches only, no auth)
router.get('/', getActiveBranches);

// Admin Branch endpoints
router.post('/', authenticate, requireRole('ADMIN'), validate(createBranchSchema), createBranch);
router.get('/admin', authenticate, requireRole('ADMIN'), getBranchesAdmin);
router.get('/:id', authenticate, requireRole('ADMIN'), getBranchById);
router.patch('/:id', authenticate, requireRole('ADMIN'), validate(updateBranchSchema), updateBranch);

// Schedule & Holiday endpoints per branch
router.post('/:branchId/business-hours', authenticate, requireRole('ADMIN'), setBusinessHours);
router.get('/:branchId/business-hours', authenticate, requireRole('ADMIN'), getBusinessHours);
router.post('/:branchId/holidays', authenticate, requireRole('ADMIN'), createHoliday);
router.get('/:branchId/holidays', authenticate, requireRole('ADMIN'), getHolidays);
router.delete('/:branchId/holidays/:holidayId', authenticate, requireRole('ADMIN'), deleteHoliday);

// Resource endpoints per branch
router.post('/:branchId/resources', authenticate, requireRole('ADMIN'), createResource);
router.get('/:branchId/resources', authenticate, requireRole('ADMIN'), getResourcesByBranch);

export default router;
