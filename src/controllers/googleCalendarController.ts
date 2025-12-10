// =========================================================
// src/controllers/googleCalendarController.ts
// Google Calendar OAuth and event management with DB sync
// =========================================================
import { Request, Response, NextFunction } from 'express';
import { google } from 'googleapis';
import asyncHandler from 'express-async-handler';
import FamilyMember from '../models/FamilyMember';
import Event from '../models/Event';
import AppError from '../utils/AppError';

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
);

// Helper to refresh token if needed
const ensureValidToken = async (familyMember: any) => {
    if (!familyMember.googleCalendar?.accessToken) {
        throw new AppError('Google Calendar not connected', 400);
    }

    const isTokenExpired = familyMember.googleCalendar.expiryDate
        ? Date.now() >= familyMember.googleCalendar.expiryDate - 60000
        : false;

    if (isTokenExpired && familyMember.googleCalendar.refreshToken) {
        try {
            console.log('[Google Calendar] Token expired, refreshing proactively...');
            oauth2Client.setCredentials({
                refresh_token: familyMember.googleCalendar.refreshToken,
            });

            const { credentials } = await oauth2Client.refreshAccessToken();

            familyMember.googleCalendar.accessToken = credentials.access_token!;
            if (credentials.expiry_date) {
                familyMember.googleCalendar.expiryDate = credentials.expiry_date;
            }
            await familyMember.save();
            console.log('[Google Calendar] Token refreshed successfully');
        } catch (error: any) {
            console.error('[Google Calendar] Proactive refresh failed:', error.message);
            throw new AppError('Calendar access expired. Please reconnect.', 401);
        }
    }

    oauth2Client.setCredentials({
        access_token: familyMember.googleCalendar.accessToken,
        refresh_token: familyMember.googleCalendar.refreshToken,
    });
};

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
        const client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            redirectUri || ''
        );

        const { tokens } = await client.getToken(code);

        if (!tokens.access_token) {
            return next(new AppError('Failed to get tokens from Google', 500));
        }

        const familyMember = await FamilyMember.findById(userId);
        if (!familyMember) {
            return next(new AppError('User not found', 404));
        }

        if (!familyMember.googleCalendar) {
            familyMember.googleCalendar = {
                accessToken: '',
                refreshToken: '',
                expiryDate: 0,
            };
        }

        familyMember.googleCalendar.accessToken = tokens.access_token;
        if (tokens.refresh_token) {
            familyMember.googleCalendar.refreshToken = tokens.refresh_token;
        }
        familyMember.googleCalendar.expiryDate = tokens.expiry_date || Date.now() + 3600000;

        await familyMember.save();

        res.status(200).json({
            status: 'success',
            message: 'Calendar connected successfully',
        });

    } catch (error: any) {
        console.error('Token exchange error:', error);
        return next(new AppError(`Failed to exchange code: ${error.message}`, 500));
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

    // Fetch events from DB
    const dbEvents = await Event.find({ householdId }).sort({ startDate: 1 });

    // Try to sync with Google Calendar
    try {
        await ensureValidToken(familyMember);

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        const calendarId = familyMember.googleCalendar?.selectedCalendarId || familyMember.email;

        let timeMin = req.query.timeMin as string;
        if (!timeMin) {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            timeMin = startOfDay.toISOString();
        }

        const listParams: any = {
            calendarId,
            timeMin,
            maxResults: 100,
            singleEvents: true,
            orderBy: 'startTime',
        };

        if (req.query.timeMax) {
            listParams.timeMax = req.query.timeMax;
        }

        console.log(`[Google Calendar] Fetching events for ${calendarId} from ${timeMin}`);

        const response = await calendar.events.list(listParams);
        const googleEvents = response.data.items || [];

        console.log(`[Google Calendar] Found ${googleEvents.length} events from Google`);

        // Reconciliation: Remove DB events that don't exist in Google anymore
        const googleEventIds = new Set(googleEvents.map(e => e.id));
        const orphanedEvents = dbEvents.filter(
            e => e.googleEventId && !googleEventIds.has(e.googleEventId)
        );

        if (orphanedEvents.length > 0) {
            console.log(`[Sync] Removing ${orphanedEvents.length} orphaned events from DB`);
            await Event.deleteMany({
                _id: { $in: orphanedEvents.map((e: any) => e._id) }
            });
        }

        // Merge DB events with Google events
        // Priority: Google Calendar events (if synced), then DB-only events
        const googleEventIdSet = new Set(googleEvents.map(e => e.id));

        // Get DB events that haven't synced to Google yet
        const unsyncedDbEvents = dbEvents.filter(
            (e: any) => !e.googleEventId || !googleEventIdSet.has(e.googleEventId)
        );

        // Convert unsynced DB events to Google Calendar format
        const formattedUnsyncedEvents = unsyncedDbEvents.map((e: any) => ({
            id: e._id.toString(),
            summary: e.title,
            description: e.description,
            location: e.location,
            start: e.allDay
                ? { date: e.startDate.toISOString().split('T')[0] }
                : { dateTime: e.startDate.toISOString() },
            end: e.allDay
                ? { date: e.endDate.toISOString().split('T')[0] }
                : { dateTime: e.endDate.toISOString() },
        }));

        // Merge: Google events + unsynced DB events
        const allEvents = [...googleEvents, ...formattedUnsyncedEvents];

        console.log(`[Sync] Returning ${googleEvents.length} Google events + ${formattedUnsyncedEvents.length} DB-only events`);

        // Return merged events
        res.status(200).json({
            status: 'success',
            data: {
                events: allEvents,
            },
        });
    } catch (error: any) {
        console.error('Calendar events error:', error);

        // If Google sync fails, return DB events as fallback
        console.log('[Sync] Google Calendar unavailable, returning DB events');

        // Convert DB events to Google Calendar format
        const formattedEvents = dbEvents.map((e: any) => ({
            id: e.googleEventId || e._id.toString(),
            summary: e.title,
            description: e.description,
            location: e.location,
            start: e.allDay
                ? { date: e.startDate.toISOString().split('T')[0] }
                : { dateTime: e.startDate.toISOString() },
            end: e.allDay
                ? { date: e.endDate.toISOString().split('T')[0] }
                : { dateTime: e.endDate.toISOString() },
        }));

        res.status(200).json({
            status: 'success',
            data: {
                events: formattedEvents,
            },
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
    const familyMember = await FamilyMember.findById(userId);

    if (!familyMember) return next(new AppError('User not found', 404));

    const { title, startDate, endDate, allDay, location, notes, attendees } = req.body;

    if (!title || !startDate || !endDate) {
        return next(new AppError('Missing required fields', 400));
    }

    // Determine the title for Google Calendar (with attendees if provided)
    let googleCalendarTitle = title;
    if (attendees && attendees.length > 0) {
        // Fetch attendee names
        const attendeeMembers = await FamilyMember.find({
            _id: { $in: attendees }
        }).select('firstName');

        const attendeeNames = attendeeMembers.map(m => m.firstName).join(', ');
        if (attendeeNames) {
            googleCalendarTitle = `${title} (${attendeeNames})`;
        }
    }

    // Step 1: Save to DB with CLEAN title (no attendee names)
    const event = await Event.create({
        householdId,
        createdBy: userId,
        title, // Clean title for app display
        description: notes,
        location,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        allDay: allDay || false,
        attendees: attendees || [],
        calendarType: attendees && attendees.length > 1 ? 'family' : 'personal',
    });

    console.log(`[DB] Event created: ${event._id} (title: "${title}")`);

    // Step 2: Sync to Google Calendar with APPENDED title
    try {
        await ensureValidToken(familyMember);

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        const calendarId = familyMember.googleCalendar?.selectedCalendarId || familyMember.email;

        console.log(`[Google Calendar] Creating event in ${calendarId}: "${googleCalendarTitle}"`);

        const googleEvent = {
            summary: googleCalendarTitle, // Title WITH attendee names
            location: location,
            description: notes,
            start: allDay
                ? { date: new Date(startDate).toISOString().split('T')[0] }
                : { dateTime: new Date(startDate).toISOString() },
            end: allDay
                ? { date: new Date(endDate).toISOString().split('T')[0] }
                : { dateTime: new Date(endDate).toISOString() },
        };

        const response = await calendar.events.insert({
            calendarId,
            requestBody: googleEvent,
        });

        // Update DB event with Google Calendar ID
        event.googleEventId = response.data.id!;
        await event.save();

        console.log(`[Google Calendar] Event created! ID: ${response.data.id}, Link: ${response.data.htmlLink}`);

        res.status(201).json({
            status: 'success',
            data: response.data,
        });
    } catch (error: any) {
        console.error('Google Calendar sync error:', error);

        // Event is saved in DB but Google sync failed
        // Return success but note the sync failure
        res.status(201).json({
            status: 'success',
            message: 'Event created locally. Google Calendar sync will retry.',
            data: {
                id: (event as any)._id.toString(),
                summary: event.title,
                start: event.allDay
                    ? { date: event.startDate.toISOString().split('T')[0] }
                    : { dateTime: event.startDate.toISOString() },
                end: event.allDay
                    ? { date: event.endDate.toISOString().split('T')[0] }
                    : { dateTime: event.endDate.toISOString() },
            },
        });
    }
});
