import express from 'express';
import { protect } from '../middleware/authMiddleware';
import {
    exchangeCodeForTokens,
    getCalendarEvents,
} from '../controllers/googleCalendarController';

const router = express.Router();

// OAuth token exchange
router.post('/exchange-code', protect, exchangeCodeForTokens);

// Get calendar events
router.get('/events', protect, getCalendarEvents);

export default router;
