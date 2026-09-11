import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import {
  getNotifications,
  markAsRead,
  markAllAsRead
} from './notifications.controller';

const router = Router();

router.get('/', authenticate, getNotifications);
router.patch('/read-all', authenticate, markAllAsRead);
router.patch('/:id/read', authenticate, markAsRead);

export default router;
