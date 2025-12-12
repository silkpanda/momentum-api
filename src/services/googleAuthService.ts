// =========================================================
// src/services/googleAuthService.ts
// Google Calendar OAuth and token management
// =========================================================
import { google } from 'googleapis';
import FamilyMember from '../models/FamilyMember';
import AppError from '../utils/AppError';

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
);

/**
 * Get configured OAuth2 client
 */
export const getOAuth2Client = () => oauth2Client;

/**
 * Ensure the user has a valid access token, refreshing if needed
 * @param familyMember - The family member document
 * @throws AppError if calendar not connected or refresh fails
 */
export const ensureValidToken = async (familyMember: any) => {
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
 * Exchange OAuth authorization code for access tokens
 * @param code - Authorization code from Google OAuth
 * @param userId - User ID to save tokens to
 * @param redirectUri - Optional redirect URI
 * @returns Success status
 */
export const exchangeCodeForTokens = async (
    code: string,
    userId: string,
    redirectUri?: string
) => {
    const client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri || ''
    );

    const { tokens } = await client.getToken(code);

    if (!tokens.access_token) {
        throw new AppError('Failed to get tokens from Google', 500);
    }

    const familyMember = await FamilyMember.findById(userId);
    if (!familyMember) {
        throw new AppError('User not found', 404);
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

    return { success: true, message: 'Calendar connected successfully' };
};
