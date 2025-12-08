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
    if (!familyMember) {
        return next(new AppError('User not found', 404));
    }

    if (!familyMember.googleCalendar?.accessToken) {
        return next(new AppError('Google Calendar not connected', 400));
    }

    // Proactively refresh if token is expired or about to expire
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
        } catch (refreshError: any) {
            console.error('[Google Calendar] Proactive refresh failed:', refreshError.message);
            // Continue anyway - let the API call fail and trigger reactive refresh
        }
    }

    try {
        oauth2Client.setCredentials({
            access_token: familyMember.googleCalendar.accessToken,
            refresh_token: familyMember.googleCalendar.refreshToken,
        });

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const response = await calendar.calendarList.list({
            minAccessRole: 'writer', // User should be able to edit the calendar
        });

        res.status(200).json({
            status: 'success',
            data: {
                calendars: response.data.items || [],
            },
        });

    } catch (error: any) {
        console.error('[Google Calendar] List calendars error:', error.message);

        // Check if this is a token error (401 or invalid_grant)
        const isTokenError = error.code === 401 ||
            error.message?.includes('invalid_grant') ||
            error.message?.includes('invalid_token') ||
            error.message?.includes('Token has been expired');

        if (isTokenError && familyMember.googleCalendar?.refreshToken) {
            try {
                console.log('[Google Calendar] Token error detected, refreshing...');
                oauth2Client.setCredentials({
                    refresh_token: familyMember.googleCalendar.refreshToken,
                });

                const { credentials } = await oauth2Client.refreshAccessToken();

                // Update stored tokens
                familyMember.googleCalendar.accessToken = credentials.access_token!;
                if (credentials.expiry_date) {
                    familyMember.googleCalendar.expiryDate = credentials.expiry_date;
                }
                await familyMember.save();
                console.log('[Google Calendar] Token refreshed, retrying request...');

                // Retry the request
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
                return;

            } catch (refreshError: any) {
                console.error('[Google Calendar] Token refresh failed detailed:', JSON.stringify(refreshError, null, 2));
                console.error('[Google Calendar] Token refresh failed message:', refreshError.message);
                return next(new AppError('Calendar access expired. Please reconnect your Google account by logging out and back in.', 401));
            }
        }

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
    if (!familyMember) {
        return next(new AppError('User not found', 404));
    }

    if (!familyMember.googleCalendar?.accessToken) {
        return next(new AppError('Google Calendar not connected', 400));
    }

    try {
        oauth2Client.setCredentials({
            access_token: familyMember.googleCalendar.accessToken,
            refresh_token: familyMember.googleCalendar.refreshToken,
        });

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const calendarId = familyMember.googleCalendar.selectedCalendarId || 'primary';

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

        // If token expired, try to refresh
        if (error.code === 401 && familyMember.googleCalendar?.refreshToken) {
            try {
                oauth2Client.setCredentials({
                    refresh_token: familyMember.googleCalendar.refreshToken,
                });

                const { credentials } = await oauth2Client.refreshAccessToken();

                // Update stored tokens
                familyMember.googleCalendar.accessToken = credentials.access_token!;
                if (credentials.expiry_date) {
                    familyMember.googleCalendar.expiryDate = credentials.expiry_date;
                }
                await familyMember.save();

                // Retry the request
                const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
                const calendarId = familyMember.googleCalendar.selectedCalendarId || 'primary';

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
                return;

            } catch (refreshError: any) {
                console.error('Token refresh error:', refreshError);
                return next(new AppError('Calendar access expired. Please reconnect.', 401));
            }
        }

        return next(new AppError(`Failed to fetch events: ${error.message}`, 500));
    }
});
