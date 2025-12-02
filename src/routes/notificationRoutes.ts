import express from 'express';
import { protect } from '../middleware/authMiddleware';
import {
    sendParentReminder,
    getNotifications,
    markAsRead,
    markAllAsRead,
    savePushToken
} from '../controllers/notificationController';

const router = express.Router();

router.use(protect);

router.get('/', getNotifications);
router.patch('/read-all', markAllAsRead);
router.patch('/:id/read', markAsRead);
router.post('/remind', sendParentReminder);
router.post('/push-token', savePushToken);

export default router;
