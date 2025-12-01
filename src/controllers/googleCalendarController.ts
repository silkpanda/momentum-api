import { Request, Response } from 'express';
import { google } from 'googleapis';
import FamilyMember from '../models/FamilyMember';
import asyncHandler from 'express-async-handler';

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);
import { Request, Response } from 'express';
import { google } from 'googleapis';
import FamilyMember from '../models/FamilyMember';
import asyncHandler from 'express-async-handler';

// OAuth2 client – uses env vars from Google Cloud Console
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// ------------------------------------------------------------
// GET /api/calendar/google/auth-url – returns the URL the client should open
// ------------------------------------------------------------
export const getAuthUrl = asyncHandler(async (req: Request, res: Response) => {
    const scopes = [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events.readonly',
    ];

    // Assuming you have a user object attached by auth middleware
    const userId = (req as any).user._id.toString();

    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline', // request refresh token
        scope: scopes,
        prompt: 'consent select_account', // force chooser & consent screen
        state: userId,
    });

    console.log('Generated OAuth URL:', url);
    res.json({ url });
});

// ------------------------------------------------------------
// GET /api/calendar/google/callback – Google redirects here after consent
// ------------------------------------------------------------
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

        const user = await FamilyMember.findById(userId);
        if (!user) {
            res.status(404);
            throw new Error('User not found');
        }

        user.googleCalendar = {
            accessToken: tokens.access_token!,
            refreshToken: tokens.refresh_token!, // may be undefined on subsequent consents
            expiryDate: tokens.expiry_date!,
        };

        // Preserve existing refresh token if Google didn't return a new one
        if (!tokens.refresh_token && user.googleCalendar.refreshToken) {
            user.googleCalendar.refreshToken = user.googleCalendar.refreshToken;
        }

        await user.save();
        // Redirect back to the mobile app via deep link
        res.redirect('momentum://calendar/success');
    } catch (error: any) {
        console.error('Error exchanging code for tokens:', error);
        res.status(500);
        throw new Error('Failed to authenticate with Google');
    }
});

// ------------------------------------------------------------
// POST /api/calendar/google/connect – Handle native mobile sign-in
// ------------------------------------------------------------
export const connectNative = asyncHandler(async (req: Request, res: Response) => {
    const { idToken, accessToken } = req.body;
    const userId = (req as any).user._id;

    if (!idToken || !accessToken) {
        res.status(400);
        throw new Error('ID token and access token are required');
    }

    try {
        // Verify the ID token with Google
        const ticket = await oauth2Client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        if (!payload) {
            res.status(400);
            throw new Error('Invalid ID token');
        }

        console.log('Verified Google user:', payload.email);

        // Find the user
        const user = await FamilyMember.findById(userId);
        if (!user) {
            res.status(404);
            throw new Error('User not found');
        }

        // Store the tokens (the native SDK provides the access token directly)
        user.googleCalendar = {
            accessToken: accessToken,
            refreshToken: accessToken, // For native sign-in, we'll refresh via the SDK
            expiryDate: Date.now() + 3600 * 1000, // 1 hour from now
        };

        await user.save();

        console.log('Google Calendar connected for user:', user.email);
        res.json({ success: true, email: payload.email });
    } catch (error: any) {
        console.error('Error verifying Google token:', error);
        res.status(500);
        throw new Error('Failed to verify Google credentials');
    }
});

// ------------------------------------------------------------
// GET /api/calendar/google/events – fetch user's primary calendar events
// ------------------------------------------------------------
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

    // Listen for token refresh events and persist them
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
