import express from 'express';
import { protect } from '../middleware/authMiddleware';
import {
    exchangeCodeForTokens,
    getCalendarEvents,
    listCalendars,
} from '../controllers/googleCalendarController';

const router = express.Router();

// OAuth token exchange
router.post('/connect', protect, exchangeCodeForTokens);

// Get calendar events
router.get('/events', protect, getCalendarEvents);

// List user's calendars
router.get('/list', protect, listCalendars);

export default router;
