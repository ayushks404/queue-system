import { Router } from 'express';
import { getAvailability } from './availability.controller';

const router = Router();

router.get('/', getAvailability);

export default router;
