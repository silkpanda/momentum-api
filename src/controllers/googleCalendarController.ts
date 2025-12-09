// =========================================================
// src/controllers/googleCalendarController.ts
// Google Calendar OAuth and event management
// =========================================================
import { Request, Response, NextFunction } from 'express';
import { google } from 'googleapis';
import asyncHandler from 'express-async-handler';
import FamilyMember from '../models/FamilyMember';
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
        ? Date.now() >= familyMember.googleCalendar.expiryDate - 60000 // Refresh 1 min before expiry
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
    // Check for code in 'code' or 'serverAuthCode' fields
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
        // Create a new OAuth client with the correct redirect URI
        const client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            redirectUri || '' // Mobile apps often use empty string or specific URI for redirect
        );

        // Exchange authorization code for tokens
        const { tokens } = await client.getToken(code);

        if (!tokens.access_token) {
            return next(new AppError('Failed to get tokens from Google', 500));
        }

        // Store tokens in user's profile
        const familyMember = await FamilyMember.findById(userId);
        if (!familyMember) {
            return next(new AppError('User not found', 404));
        }

        // Initialize googleCalendar object if it doesn't exist
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
 * @desc    Get Google Calendar events
 * @route   GET /api/v1/calendar/google/events
 * @access  Protected
 */
export const getCalendarEvents = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
    const userId = req.user?._id;
    const familyMember = await FamilyMember.findById(userId);
    if (!familyMember) return next(new AppError('User not found', 404));

    await ensureValidToken(familyMember);

    try {
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        const calendarId = familyMember.googleCalendar?.selectedCalendarId || 'primary';

        const response = await calendar.events.list({
            calendarId,
            timeMin: new Date().toISOString(),
            maxResults: 50,
            singleEvents: true,
            orderBy: 'startTime',
        });

        res.status(200).json({
            status: 'success',
            data: {
                events: response.data.items || [],
            },
        });
    } catch (error: any) {
        console.error('Calendar events error:', error);
        return next(new AppError(`Failed to fetch events: ${error.message}`, 500));
    }
});

/**
 * @desc    Create a new event in Google Calendar
 * @route   POST /api/v1/calendar/google/events
 * @access  Protected
 */
export const createCalendarEvent = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
    const userId = req.user?._id;
    const familyMember = await FamilyMember.findById(userId);
    if (!familyMember) return next(new AppError('User not found', 404));

    await ensureValidToken(familyMember);

    const { title, startDate, endDate, allDay, location, notes } = req.body;

    if (!title || !startDate || !endDate) {
        return next(new AppError('Missing required fields', 400));
    }

    try {
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        const calendarId = familyMember.googleCalendar?.selectedCalendarId || 'primary';

        const event = {
            summary: title,
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
            requestBody: event,
        });

        res.status(201).json({
            status: 'success',
            data: response.data,
        });
    } catch (error: any) {
        console.error('Create event error:', error);
        return next(new AppError(`Failed to create event: ${error.message}`, 500));
    }
});
