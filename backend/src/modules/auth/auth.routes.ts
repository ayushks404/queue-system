import { Router } from 'express';
import { register, login, refresh, logout, getMe } from './auth.controller';
import { authenticate, requireRole } from './auth.middleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', authenticate, getMe);
router.get('/admin-only', authenticate, requireRole('ADMIN'), (req, res) => {
  res.status(200).json({
    success: true,
    data: { message: 'admin access granted' }
  });
});

export default router;
