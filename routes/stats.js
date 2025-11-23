import { Router } from 'express';
import authMiddleware from '../middleware/auth.js';
import { getDashboardData } from '../controllers/stats.js';

const router = Router();

router.get('/dashboard', authMiddleware, getDashboardData);

export default router;
