import { Router } from 'express';
import {
  createResource,
  getAllResources,
  getResourcesByBranch,
  updateResource,
  deleteResource,
  setServiceResources,
  getServiceResources
} from './resources.controller';
import { authenticate, requireRole } from '../auth/auth.middleware';

const router = Router();

// Resource endpoints
router.get('/', authenticate, requireRole('ADMIN'), getAllResources);
router.post('/', authenticate, requireRole('ADMIN'), createResource);
router.patch('/:id', authenticate, requireRole('ADMIN'), updateResource);
router.delete('/:id', authenticate, requireRole('ADMIN'), deleteResource);

export default router;
export {
  createResource,
  getAllResources,
  getResourcesByBranch,
  setServiceResources,
  getServiceResources
};
