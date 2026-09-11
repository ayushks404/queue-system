import { Router } from 'express';
import {
  createResource,
  getResourcesByBranch,
  updateResource,
  deleteResource,
  setServiceResources,
  getServiceResources
} from './resources.controller';
import { authenticate, requireRole } from '../auth/auth.middleware';

const router = Router();

// Resource endpoints
router.post('/', authenticate, requireRole('ADMIN'), createResource);
router.patch('/:id', authenticate, requireRole('ADMIN'), updateResource);
router.delete('/:id', authenticate, requireRole('ADMIN'), deleteResource);

export default router;
export {
  createResource,
  getResourcesByBranch,
  setServiceResources,
  getServiceResources
};
