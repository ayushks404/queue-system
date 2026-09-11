import { Router } from 'express';
import { register, login } from './auth.controller';
import { authenticate } from './auth.middleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/test-protected', authenticate, (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user
  });
});

export default router;
