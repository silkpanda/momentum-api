
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

// Color mapping: Our hex colors to Google Calendar color IDs
// See: https://lukeboyle.com/blog/posts/google-calendar-api-color-id
const COLOR_MAP: { [key: string]: string } = {
    '#EF4444': '11', // Red -> Tomato
    '#F97316': '6',  // Orange -> Tangerine
    '#F59E0B': '5',  // Amber -> Banana
    '#10B981': '10', // Emerald -> Basil
    '#06B6D4': '7',  // Cyan -> Peacock
    '#3B82F6': '9',  // Blue -> Blueberry
    '#6366F1': '1',  // Indigo -> Lavender
    '#8B5CF6': '3',  // Violet -> Grape
    '#EC4899': '4',  // Pink -> Flamingo
    '#6B7280': '8',  // Gray -> Graphite
};

function getClosestGoogleColor(hexColor: string): string {
    // If exact match found, return it
    if (COLOR_MAP[hexColor]) return COLOR_MAP[hexColor];

    // Default to Blueberry (Blue) if no match
    return '9';
}

export async function createNewCalendar(
    accessToken: string,
    details: { summary: string; description?: string; colorRgbFormat?: boolean },
    refreshToken?: string
): Promise<{ calendarId: string }> {
    const oauth2Client = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const response = await calendar.calendars.insert({
        requestBody: {
            summary: details.summary,
            description: details.description,
            timeZone: 'America/Chicago', // We might want to make this dynamic later
        },
    });

    return { calendarId: response.data.id! };
}

export async function createMemberCalendar(
    name: string,
    hexColor: string,
    accessToken: string,
    refreshToken?: string
): Promise<string> {
    const oauth2Client = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Create the calendar
    const response = await calendar.calendars.insert({
        requestBody: {
            summary: name,
            timeZone: 'America/Chicago', // Default for now
        },
    });

    const calendarId = response.data.id!;

    // Set calendar color
    await updateGoogleCalendarColor(calendarId, hexColor, accessToken, refreshToken);

    return calendarId;
}

export async function updateGoogleCalendarColor(
    calendarId: string,
    hexColor: string,
    accessToken: string,
    refreshToken?: string
): Promise<void> {
    const oauth2Client = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const googleColorId = getClosestGoogleColor(hexColor);

    try {
        await calendar.calendarList.update({
            calendarId,
            requestBody: {
                colorId: googleColorId,
            },
        });
    } catch (error) {
        console.error('Error updating calendar color:', error);
    }
}

export async function listUserCalendars(accessToken: string, refreshToken?: string): Promise<any[]> {
    const oauth2Client = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const response = await calendar.calendarList.list({
        minAccessRole: 'writer', // Only show calendars we can edit
    });

    return response.data.items || [];
}
