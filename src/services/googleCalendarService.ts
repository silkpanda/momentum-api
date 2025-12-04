// =========================================================
// src/services/googleCalendarService.ts
// Google Calendar API Service
// =========================================================
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

export interface CalendarListItem {
    id: string;
    summary: string;
    description?: string;
    primary?: boolean;
    backgroundColor?: string;
}

export interface CreateCalendarParams {
    summary: string;
    description?: string;
    timeZone?: string;
}

/**
 * List all calendars for the authenticated user
 */
export async function listUserCalendars(accessToken: string): Promise<CalendarListItem[]> {
    oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    try {
        const response = await calendar.calendarList.list({
            minAccessRole: 'owner', // Only show calendars the user owns
        });

        const calendars: CalendarListItem[] = (response.data.items || []).map(item => ({
            id: item.id || '',
            summary: item.summary || '',
            description: item.description || undefined,
            primary: item.primary || undefined,
            backgroundColor: item.backgroundColor || undefined,
        }));

        return calendars;
    } catch (error: any) {
        console.error('Error listing calendars:', error);
        throw new Error(`Failed to list calendars: ${error.message}`);
    }
}

/**
 * Create a new Google Calendar
 */
export async function createNewCalendar(
    accessToken: string,
    params: CreateCalendarParams
): Promise<{ calendarId: string; summary: string }> {
    oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    try {
        const response = await calendar.calendars.insert({
            requestBody: {
                summary: params.summary,
                description: params.description,
                timeZone: params.timeZone || 'America/Chicago',
            },
        });

        return {
            calendarId: response.data.id || '',
            summary: response.data.summary || '',
        };
    } catch (error: any) {
        console.error('Error creating calendar:', error);
        throw new Error(`Failed to create calendar: ${error.message}`);
    }
}

/**
 * Get calendar details by ID
 */
export async function getCalendarById(
    accessToken: string,
    calendarId: string
): Promise<CalendarListItem | null> {
    oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    try {
        const response = await calendar.calendars.get({
            calendarId,
        });

        return {
            id: response.data.id || '',
            summary: response.data.summary || '',
            description: response.data.description || undefined,
        };
    } catch (error: any) {
        console.error('Error getting calendar:', error);
        return null;
    }
}

/**
 * Verify user has access to a calendar
 */
export async function verifyCalendarAccess(
    accessToken: string,
    calendarId: string
): Promise<boolean> {
    const calendar = await getCalendarById(accessToken, calendarId);
    return calendar !== null;
}
