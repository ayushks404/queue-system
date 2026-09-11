import { Router } from 'express';
import {
  getActiveServices,
  createService,
  getServicesAdmin,
  getServiceById,
  updateService,
  deleteService
} from './services.controller';
import { setServiceResources, getServiceResources } from './resources.controller';
import { authenticate, requireRole } from '../auth/auth.middleware';

const router = Router();

// Public endpoint (Active services only, no auth)
router.get('/', getActiveServices);

// Admin Service endpoints
router.post('/', authenticate, requireRole('ADMIN'), createService);
router.get('/admin', authenticate, requireRole('ADMIN'), getServicesAdmin);
router.get('/:id', authenticate, requireRole('ADMIN'), getServiceById);
router.patch('/:id', authenticate, requireRole('ADMIN'), updateService);
router.delete('/:id', authenticate, requireRole('ADMIN'), deleteService);

// Service resources linking
router.post('/:serviceId/resources', authenticate, requireRole('ADMIN'), setServiceResources);
router.get('/:serviceId/resources', authenticate, requireRole('ADMIN'), getServiceResources);

export default router;
