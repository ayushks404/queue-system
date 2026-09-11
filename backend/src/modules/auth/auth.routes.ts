import { Router } from 'express';
import { register, login, refresh, logout, getMe } from './auth.controller';
import { authenticate, requireRole } from './auth.middleware';
import { validate } from '../../middleware/validate';
import { registerSchema, loginSchema, refreshSchema } from '../../middleware/schemas';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/refresh', validate(refreshSchema), refresh);
router.post('/logout', logout);
router.get('/me', authenticate, getMe);
router.get('/admin-only', authenticate, requireRole('ADMIN'), (req, res) => {
  res.status(200).json({
    success: true,
    data: { message: 'admin access granted' }
  });
});

export default router;
