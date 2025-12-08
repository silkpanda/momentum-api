
import express from 'express';
import { protect } from '../middleware/authMiddleware';
import * as dashboardController from '../controllers/dashboardController';

const router = express.Router();

// All routes are protected
router.use(protect);

router.get('/page-data', dashboardController.getDashboardData);

export default router;
