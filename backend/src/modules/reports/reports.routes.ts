import { Router } from 'express';
import { authenticate, requireRole } from '../auth/auth.middleware';
import { getReportsSummary } from './reports.controller';

const router = Router();

router.get('/summary', authenticate, requireRole('ADMIN', 'STAFF'), getReportsSummary);

export default router;
