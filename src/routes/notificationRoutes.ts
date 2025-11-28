import express from 'express';
import { protect } from '../middleware/authMiddleware';
import { sendParentReminder } from '../controllers/notificationController';

const router = express.Router();

router.use(protect);

router.post('/remind', sendParentReminder);

export default router;
