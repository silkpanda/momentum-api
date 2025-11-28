import { Request, Response } from 'express';
import { google } from 'googleapis';
import FamilyMember from '../models/FamilyMember';
import asyncHandler from 'express-async-handler';

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// @desc    Get Google OAuth URL
// @route   GET /api/calendar/google/auth-url
// @access  Private
export const getAuthUrl = asyncHandler(async (req: Request, res: Response) => {
    const scopes = [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events.readonly'
    ];

    const userId = (req as any).user._id.toString();

    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline', // Request refresh token
        scope: scopes,
        prompt: 'select_account', // Force account chooser so user can pick a different Gmail account
        state: userId, // Pass user ID as state to identify user in callback
    });

    res.json({ url });
});

// @desc    Handle Google OAuth Callback
// @route   GET /api/calendar/google/callback
// @access  Public (but validates state)
export const oauthCallback = asyncHandler(async (req: Request, res: Response) => {
    const { code, state } = req.query;

    if (!code) {
        res.status(400);
        throw new Error('Authorization code is missing');
    }

    if (!state) {
        res.status(400);
        throw new Error('State parameter is missing');
    }

    const userId = state as string;

    try {
        const { tokens } = await oauth2Client.getToken(code as string);

        // Update user with tokens
        const user = await FamilyMember.findById(userId);
        if (!user) {
            res.status(404);
            throw new Error('User not found');
        }

        user.googleCalendar = {
            accessToken: tokens.access_token!,
            refreshToken: tokens.refresh_token!, // Only returned on first consent or if prompt='consent'
            expiryDate: tokens.expiry_date!,
        };

        // If refresh token is missing (e.g. re-auth without prompt='consent'), keep the old one if it exists
        if (!tokens.refresh_token && user.googleCalendar.refreshToken) {
            // Keep existing refresh token
        } else if (!tokens.refresh_token) {
            // This is bad, we need a refresh token. 
            // In a real app, we might force re-consent here.
            console.warn('No refresh token returned from Google');
        }

        await user.save();

        // Redirect to mobile app
        res.redirect('momentum://calendar/success');
    } catch (error: any) {
        console.error('Error exchanging code for tokens:', error);
        res.status(500);
        throw new Error('Failed to authenticate with Google');
    }
});

// @desc    List Google Calendar Events
// @route   GET /api/calendar/google/events
// @access  Private
export const listEvents = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user._id;
    const user = await FamilyMember.findById(userId);

    if (!user || !user.googleCalendar || !user.googleCalendar.accessToken) {
        res.status(400);
        throw new Error('Google Calendar not connected');
    }

    oauth2Client.setCredentials({
        access_token: user.googleCalendar.accessToken,
        refresh_token: user.googleCalendar.refreshToken,
        expiry_date: user.googleCalendar.expiryDate,
    });

    // Handle token refresh if needed (googleapis handles this automatically if refresh_token is set)
    // But we might want to save the new tokens if they change.
    oauth2Client.on('tokens', async (tokens) => {
        if (tokens.access_token) {
            user.googleCalendar!.accessToken = tokens.access_token;
            user.googleCalendar!.expiryDate = tokens.expiry_date!;
        }
        if (tokens.refresh_token) {
            user.googleCalendar!.refreshToken = tokens.refresh_token;
        }
        await user.save();
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    try {
        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: new Date().toISOString(),
            maxResults: 20,
            singleEvents: true,
            orderBy: 'startTime',
        });

        const events = response.data.items;
        res.json(events);
    } catch (error: any) {
        console.error('Error fetching calendar events:', error);
        res.status(500);
        throw new Error('Failed to fetch events');
    }
});
