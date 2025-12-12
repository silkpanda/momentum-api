import express from 'express';
import { protect } from '../middleware/authMiddleware';
import {
    exchangeCodeForTokens,
    getCalendarEvents,
    listCalendars,
    createCalendarEvent,
    updateGoogleEvent,
} from '../controllers/googleCalendarController';

const router = express.Router();

// OAuth token exchange
router.post('/connect', protect, exchangeCodeForTokens);

// Get calendar events
router.get('/events', protect, getCalendarEvents);

// Create calendar event
router.post('/events', protect, createCalendarEvent);

// Update calendar event
router.patch('/events/:id', protect, updateGoogleEvent);

// Delete calendar event
router.delete('/events/:id', protect, (req, res, next) => {
    // Dynamic import to avoid circular dependency issues if any, or just direct import
    import('../controllers/googleCalendarController').then(c => c.deleteGoogleEvent(req, res, next));
});

// List user's calendars
router.get('/list', protect, listCalendars);

export default router;
