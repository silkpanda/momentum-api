import express from 'express';
import { protect } from '../middleware/authMiddleware';
import {
    getAuthUrl,
    oauthCallback,
    listEvents,
    connectNative,
} from '../controllers/googleCalendarController';

const router = express.Router();

router.get('/auth-url', protect, getAuthUrl);
router.get('/callback', oauthCallback);
router.get('/events', protect, listEvents);
router.post('/connect', protect, connectNative);

export default router;
