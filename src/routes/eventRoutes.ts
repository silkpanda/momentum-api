// src/routes/eventRoutes.ts
import express from 'express';
import {
    createEvent,
    getEvents,
    getEvent,
    updateEvent,
    deleteEvent,
} from '../controllers/eventController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Event CRUD
router.route('/')
    .get(getEvents)      // GET /api/v1/events
    .post(createEvent);  // POST /api/v1/events

router.route('/:id')
    .get(getEvent)       // GET /api/v1/events/:id
    .patch(updateEvent)  // PATCH /api/v1/events/:id
    .delete(deleteEvent); // DELETE /api/v1/events/:id

export default router;
