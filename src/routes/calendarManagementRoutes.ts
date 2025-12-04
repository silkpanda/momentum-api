// =========================================================
// src/routes/calendarManagementRoutes.ts
// Routes for calendar selection and creation during onboarding
// =========================================================
import express, { Request, Response, NextFunction } from 'express';
import { protect } from '../middleware/authMiddleware';
import asyncHandler from 'express-async-handler';
import AppError from '../utils/AppError';
import FamilyMember from '../models/FamilyMember';
import {
    listUserCalendars,
    createNewCalendar,
    verifyCalendarAccess,
} from '../services/googleCalendarService';

const router = express.Router();

/**
 * @desc    List user's Google Calendars
 * @route   GET /api/v1/calendar/list
 * @access  Protected
 */
router.get('/list', protect, asyncHandler(async (req: any, res: Response, next: NextFunction) => {
    const userId = req.user?._id;

    const familyMember = await FamilyMember.findById(userId);
    if (!familyMember) {
        return next(new AppError('User not found', 404));
    }

    if (!familyMember.googleCalendar?.accessToken) {
        return next(new AppError('Google Calendar not connected', 400));
    }

    try {
        const calendars = await listUserCalendars(familyMember.googleCalendar.accessToken);

        res.status(200).json({
            status: 'success',
            data: { calendars },
        });
    } catch (error: any) {
        return next(new AppError(`Failed to fetch calendars: ${error.message}`, 500));
    }
}));

/**
 * @desc    Create a new Google Calendar
 * @route   POST /api/v1/calendar/create
 * @access  Protected
 */
router.post('/create', protect, asyncHandler(async (req: any, res: Response, next: NextFunction) => {
    const userId = req.user?._id;
    const { summary, description } = req.body;

    if (!summary) {
        return next(new AppError('Calendar summary is required', 400));
    }

    const familyMember = await FamilyMember.findById(userId);
    if (!familyMember) {
        return next(new AppError('User not found', 404));
    }

    if (!familyMember.googleCalendar?.accessToken) {
        return next(new AppError('Google Calendar not connected', 400));
    }

    try {
        const newCalendar = await createNewCalendar(
            familyMember.googleCalendar.accessToken,
            {
                summary: summary || 'Momentum Family Calendar',
                description: description || 'Calendar for family tasks and events',
            }
        );

        res.status(201).json({
            status: 'success',
            data: { calendar: newCalendar },
        });
    } catch (error: any) {
        return next(new AppError(`Failed to create calendar: ${error.message}`, 500));
    }
}));

/**
 * @desc    Verify calendar access
 * @route   POST /api/v1/calendar/verify
 * @access  Protected
 */
router.post('/verify', protect, asyncHandler(async (req: any, res: Response, next: NextFunction) => {
    const userId = req.user?._id;
    const { calendarId } = req.body;

    if (!calendarId) {
        return next(new AppError('Calendar ID is required', 400));
    }

    const familyMember = await FamilyMember.findById(userId);
    if (!familyMember) {
        return next(new AppError('User not found', 404));
    }

    if (!familyMember.googleCalendar?.accessToken) {
        return next(new AppError('Google Calendar not connected', 400));
    }

    try {
        const hasAccess = await verifyCalendarAccess(
            familyMember.googleCalendar.accessToken,
            calendarId
        );

        res.status(200).json({
            status: 'success',
            data: { hasAccess },
        });
    } catch (error: any) {
        return next(new AppError(`Failed to verify calendar access: ${error.message}`, 500));
    }
}));

export default router;
