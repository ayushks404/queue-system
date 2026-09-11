import { Router } from 'express';
import {
  createService,
  getServicesAdmin,
  getServiceById,
  updateService,
  deleteService
} from './services.controller';
import { authenticate, requireRole } from '../auth/auth.middleware';

const router = Router();

router.post('/', authenticate, requireRole('ADMIN'), createService);
router.get('/admin', authenticate, requireRole('ADMIN'), getServicesAdmin);
router.get('/:id', authenticate, requireRole('ADMIN'), getServiceById);
router.patch('/:id', authenticate, requireRole('ADMIN'), updateService);
router.delete('/:id', authenticate, requireRole('ADMIN'), deleteService);

export default router;
