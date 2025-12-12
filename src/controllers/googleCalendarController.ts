// =========================================================
// src/controllers/googleCalendarController.ts
// Google Calendar OAuth and event management with DB sync
// =========================================================
import { Request, Response, NextFunction } from 'express';
import { google } from 'googleapis';
import { Types } from 'mongoose';
import asyncHandler from 'express-async-handler';
import FamilyMember from '../models/FamilyMember';
import Event from '../models/Event';
import Household from '../models/Household';
import AppError from '../utils/AppError';
import { ensureValidToken, exchangeCodeForTokens as exchangeTokens, getOAuth2Client } from '../services/googleAuthService';
import { performCalendarSync } from '../services/googleCalendarSyncService';
import { createEvent, updateEvent, deleteEvent } from '../services/googleCalendarEventService';

const oauth2Client = getOAuth2Client();

/**
 * @desc    Exchange OAuth authorization code for access tokens
 * @route   POST /api/v1/calendar/google/exchange-code
 * @access  Protected
 */
export const exchangeCodeForTokens = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
    const code = req.body.code || req.body.serverAuthCode;
    const { redirectUri } = req.body;
    const userId = req.user?._id;

    if (!code) {
        return next(new AppError('Authorization code is required', 400));
    }

    if (!userId) {
        return next(new AppError('User not authenticated', 401));
    }

    try {
        const result = await exchangeTokens(code, userId, redirectUri);
        res.status(200).json({
            status: 'success',
            message: result.message,
        });
    } catch (error: any) {
        console.error('Token exchange error:', error);
        return next(error);
    }
});

/**
 * @desc    List user's Google Calendars
 * @route   GET /api/v1/calendar/google/list
 * @access  Protected
 */
export const listCalendars = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
    const userId = req.user?._id;
    const familyMember = await FamilyMember.findById(userId);
    if (!familyMember) return next(new AppError('User not found', 404));

    await ensureValidToken(familyMember);

    try {
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        const response = await calendar.calendarList.list({
            minAccessRole: 'writer',
        });

        res.status(200).json({
            status: 'success',
            data: {
                calendars: response.data.items || [],
            },
        });
    } catch (error: any) {
        console.error('[Google Calendar] List calendars error:', error.message);
        return next(new AppError(`Failed to list calendars: ${error.message}`, 500));
    }
});

/**
 * @desc    Get Google Calendar events with DB reconciliation
 * @route   GET /api/v1/calendar/google/events
 * @access  Protected
 */
export const getCalendarEvents = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
    const userId = req.user?._id;
    const householdId = req.householdId;

    const familyMember = await FamilyMember.findById(userId);
    if (!familyMember) return next(new AppError('User not found', 404));

    try {
        const events = await performCalendarSync(
            familyMember,
            householdId,
            req.query.timeMin as string,
            req.query.timeMax as string
        );

        res.status(200).json({
            status: 'success',
            data: {
                events: events,
            },
        });
    } catch (error: any) {
        console.error('Calendar sync error:', error);

        console.log('[Sync] Sync failed, attempting fallback to DB events');
        // Simple fallback
        const dbEvents = await Event.find({ householdId }).sort({ startDate: 1 });
        const formattedEvents = dbEvents.map((e: any) => ({
            id: e.googleEventId || e._id.toString(),
            title: e.title,
            summary: e.title,
            description: e.description,
            location: e.location,
            color: e.color || '#3B82F6',
            start: e.allDay ? { date: e.startDate.toISOString().split('T')[0] } : { dateTime: e.startDate.toISOString() },
            end: e.allDay ? { date: e.endDate.toISOString().split('T')[0] } : { dateTime: e.endDate.toISOString() },
            allDay: e.allDay
        }));

        res.status(200).json({
            status: 'success',
            message: 'Using offline data',
            data: {
                events: formattedEvents
            }
        });
    }
});

/**
 * @desc    Create a new event (DB + Google Calendar sync)
 * @route   POST /api/v1/calendar/google/events
 * @access  Protected
 */
export const createCalendarEvent = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
    const userId = req.user?._id;
    const householdId = req.householdId;

    if (!req.body.title || !req.body.startDate || !req.body.endDate) {
        return next(new AppError('Missing required fields', 400));
    }

    try {
        console.log('[Create Event] Request received for household:', householdId);

        const { event, googleResponse, syncError, eventColor } = await createEvent(userId, householdId.toString(), req.body);

        console.log(`[DB] Event created: ${event._id}`);
        if (googleResponse) {
            console.log(`[Google Calendar] ✅ Event created! ID: ${googleResponse.id}, Link: ${googleResponse.htmlLink}`);
        }

        // Emit WebSocket event to notify all clients in the household
        const io = req.app.get('io');
        if (io) {
            io.to(householdId.toString()).emit('event_updated', {
                action: 'created',
                eventId: (event as any)._id.toString()
            });
        }

        if (syncError) {
            res.status(201).json({
                status: 'success',
                message: 'Event created locally. Google Calendar sync will retry.',
                data: {
                    id: (event as any)._id.toString(),
                    summary: event.title,
                    color: eventColor,
                    start: event.allDay
                        ? { date: event.startDate.toISOString().split('T')[0] }
                        : { dateTime: event.startDate.toISOString() },
                    end: event.allDay
                        ? { date: event.endDate.toISOString().split('T')[0] }
                        : { dateTime: event.endDate.toISOString() },
                },
            });
        } else {
            res.status(201).json({
                status: 'success',
                data: {
                    ...(googleResponse || {}),
                    color: eventColor, // Include color in response
                },
            });
        }

    } catch (error: any) {
        // Handle standard AppErrors (404, 400 etc) from service
        console.error('Create event error:', error);
        next(error);
    }
});

/**
 * @desc    Update an existing Google Calendar event
 * @route   PATCH /api/v1/calendar/google/events/:id
 * @access  Protected
 */
export const updateGoogleEvent = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
    const userId = req.user?._id;
    const householdId = req.householdId;
    const { id } = req.params;

    try {
        const { event, googleResponse, syncError, eventColor } = await updateEvent(userId, householdId.toString(), id, req.body);

        console.log(`[DB] Event updated: ${event._id}`);
        if (googleResponse) {
            console.log(`[Google Calendar] Event updated: ${event.googleEventId}`);
        }

        // Emit WebSocket event regardless of sync status (since DB is updated)
        const io = req.app.get('io');
        if (io) {
            io.to(householdId.toString()).emit('event_updated', {
                action: 'updated',
                eventId: (event as any)._id.toString()
            });
        }

        if (syncError) {
            res.status(200).json({
                status: 'success',
                message: 'Event updated locally. Google Calendar sync will retry.',
                data: {
                    id: event._id,
                    title: event.title,
                    color: eventColor,
                },
            });
        } else {
            res.status(200).json({
                status: 'success',
                data: {
                    id: event._id,
                    title: event.title,
                    color: eventColor,
                },
            });
        }

    } catch (error: any) {
        console.error('Update event error:', error);
        next(error);
    }
});

/**
 * @desc    Delete a Google Calendar event
 * @route   DELETE /api/v1/calendar/google/events/:id
 * @access  Protected
 */
export const deleteGoogleEvent = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
    const userId = req.user?._id;
    const householdId = req.householdId;
    const { id } = req.params;

    try {
        await deleteEvent(userId, householdId.toString(), id);

        console.log(`[DB] Event deleted: ${id}`);

        // Emit WebSocket event
        const io = req.app.get('io');
        if (io) {
            io.to(householdId.toString()).emit('event_updated', {
                action: 'deleted',
                eventId: id
            });
        }

        res.status(200).json({
            status: 'success',
            message: 'Event deleted successfully',
        });

    } catch (error: any) {
        console.error('Delete event error:', error);
        next(error);
    }
});
