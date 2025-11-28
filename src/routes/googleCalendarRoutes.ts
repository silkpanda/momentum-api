import express from 'express';
import { protect } from '../middleware/authMiddleware';
import {
    getAuthUrl,
    oauthCallback,
    listEvents,
} from '../controllers/googleCalendarController';

const router = express.Router();

router.get('/auth-url', protect, getAuthUrl);
router.get('/callback', oauthCallback);
router.get('/events', protect, listEvents);

export default router;
