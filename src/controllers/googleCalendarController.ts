// =========================================================
// src/controllers/googleCalendarController.ts
// Google Calendar OAuth and event management with DB sync
// =========================================================
import { Request, Response, NextFunction } from 'express';
import { google } from 'googleapis';
import asyncHandler from 'express-async-handler';
import FamilyMember from '../models/FamilyMember';
import Event from '../models/Event';
import Household from '../models/Household';
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
        const household = await Household.findById(householdId);

        let timeMin = req.query.timeMin as string;
        if (!timeMin) {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            timeMin = startOfDay.toISOString();
        }

        // FIX: Only fetch DB events within the requested window to avoid analyzing past events as orphans
        console.log(`[Sync] Fetching DB events for household ${householdId} after ${timeMin}`);
        const scopedDbEvents = await Event.find({
            householdId,
            startDate: { $gte: new Date(timeMin) }
        }).sort({ startDate: 1 });
        console.log(`[Sync] Found ${scopedDbEvents.length} events in DB`);

        // Determine which calendars to fetch
        const calendarIdsToFetch = new Set<string>();

        // 1. Personal Calendar (if selected)
        if (familyMember.googleCalendar?.selectedCalendarId) {
            calendarIdsToFetch.add(familyMember.googleCalendar.selectedCalendarId);
        } else {
            calendarIdsToFetch.add('primary'); // Fallback to primary
        }

        // 2. Family Calendar (if different)
        if (household?.familyCalendarId) {
            calendarIdsToFetch.add(household.familyCalendarId);
        }

        // 3. Child Calendars (Fetch all household members)
        if (household && household.memberProfiles) {
            const memberIds = household.memberProfiles.map(p => p.familyMemberId);
            const allMembers = await FamilyMember.find({ _id: { $in: memberIds } });

            allMembers.forEach(member => {
                if (member.googleCalendar?.selectedCalendarId) {
                    // Only add if it's a valid string
                    calendarIdsToFetch.add(member.googleCalendar.selectedCalendarId);
                }
            });
        }

        console.log(`[Google Calendar] Fetching events from:`, Array.from(calendarIdsToFetch));

        let googleEvents: any[] = [];

        // Fetch from all targets in parallel
        await Promise.all(Array.from(calendarIdsToFetch).map(async (targetCalendarId) => {
            try {
                const listParams: any = {
                    calendarId: targetCalendarId,
                    timeMin,
                    maxResults: 100, // Limit per calendar to avoid huge payloads
                    singleEvents: true,
                    orderBy: 'startTime',
                };

                if (req.query.timeMax) {
                    listParams.timeMax = req.query.timeMax;
                }

                const response = await calendar.events.list(listParams);
                if (response.data.items) {
                    // Tag them so we know source (optional, but useful for debugging)
                    const items = response.data.items.map(item => ({ ...item, _sourceCalendarId: targetCalendarId }));
                    googleEvents.push(...items);
                }
            } catch (err: any) {
                console.error(`[Google Calendar] Failed to fetch events from ${targetCalendarId}:`, err.message);
                // Continue fetching others even if one fails
            }
        }));

        // Deduplicate events by ID (just in case)
        const uniqueEventsMap = new Map();
        googleEvents.forEach(e => uniqueEventsMap.set(e.id, e));
        googleEvents = Array.from(uniqueEventsMap.values());

        console.log(`[Google Calendar] Total unique events found: ${googleEvents.length}`);

        // ... (Reconciliation logic is commented out above) ...

        const googleEventIdSet = new Set(googleEvents.map(e => e.id));

        // Get DB events that haven't synced to Google yet OR were not returned by Google
        const unsyncedDbEvents = scopedDbEvents.filter(
            (e: any) => {
                const isMissingFromGoogle = !e.googleEventId || !googleEventIdSet.has(e.googleEventId);
                if (isMissingFromGoogle) {
                    // console.log(`[Sync] Include DB Event: ${e.title} (Reason: ${!e.googleEventId ? 'No Google ID' : 'Not in Google List'})`);
                }
                return isMissingFromGoogle;
            }
        );
        console.log(`[Sync] Merging ${unsyncedDbEvents.length} DB-only/Missing events`);

        // ... (conversion logic) ...


        // Merge: Google events + unsynced DB events
        const REVERSE_COLOR_MAP: { [key: string]: string } = {
            '1': '#7986CB',  // Lavender
            '2': '#33B679',  // Sage
            '3': '#8E24AA',  // Grape
            '4': '#E67C73',  // Flamingo
            '5': '#F6BF26',  // Banana
            '6': '#F4511E',  // Tangerine
            '7': '#039BE5',  // Peacock
            '8': '#616161',  // Graphite
            '9': '#3F51B5',  // Blueberry
            '10': '#0B8043', // Basil
            '11': '#D50000', // Tomato
        };

        const mapGoogleEvent = (e: any) => ({
            id: e.id,
            title: e.summary || 'No Title',
            summary: e.summary,
            description: e.description,
            location: e.location,
            color: REVERSE_COLOR_MAP[e.colorId] || '#3B82F6', // Default to Blue
            start: e.start,
            end: e.end,
            allDay: !e.start.dateTime,
        });

        const mappedGoogleEvents = googleEvents.map(mapGoogleEvent);

        // Convert unsynced DB events to Google Calendar format
        const formattedUnsyncedEvents = unsyncedDbEvents.map((e: any) => ({
            id: e._id.toString(),
            summary: e.title,
            title: e.title,
            description: e.description,
            location: e.location,
            color: e.color || '#3B82F6', // Use saved DB color!
            start: e.allDay
                ? { date: e.startDate.toISOString().split('T')[0] }
                : { dateTime: e.startDate.toISOString() },
            end: e.allDay
                ? { date: e.endDate.toISOString().split('T')[0] }
                : { dateTime: e.endDate.toISOString() },
            allDay: e.allDay
        }));

        // Merge: Google events + unsynced DB events
        const allEvents = [...mappedGoogleEvents, ...formattedUnsyncedEvents];

        console.log(`[Sync] Returning ${mappedGoogleEvents.length} Google events + ${formattedUnsyncedEvents.length} DB-only events`);

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
            color: e.color || '#3B82F6', // Use saved DB color!
            start: e.allDay
                ? { date: e.startDate.toISOString().split('T')[0] }
                : { dateTime: e.startDate.toISOString() },
            end: e.allDay
                ? { date: e.endDate.toISOString().split('T')[0] }
                : { dateTime: e.endDate.toISOString() },
            allDay: e.allDay
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

    console.log('[Create Event] Request received:', {
        userId,
        householdId,
        body: req.body,
    });

    if (!familyMember) return next(new AppError('User not found', 404));

    const { title, startDate, endDate, allDay, location, notes, attendees } = req.body;

    if (!title || !startDate || !endDate) {
        return next(new AppError('Missing required fields', 400));
    }

    // Fetch household for family calendar and color info
    console.log('[Create Event] Fetching household:', householdId);
    const household = await Household.findById(householdId);
    if (!household) {
        console.error('[Create Event] Household not found:', householdId);
        return next(new AppError('Household not found', 404));
    }
    console.log('[Create Event] Household found:', household.householdName);
    console.log('[Create Event] Family Calendar ID:', household.familyCalendarId);
    console.log('[Create Event] Family Color:', household.familyColor);
    console.log('[Create Event] Parent Calendar ID:', familyMember.googleCalendar?.selectedCalendarId);

    // Determine calendar routing and color based on attendees
    let targetCalendarId: string;
    let eventColor: string;
    let googleCalendarTitle = title;
    let calendarType: 'personal' | 'family' = 'personal';

    if (!attendees || attendees.length === 0) {
        // No attendees → Parent's calendar
        targetCalendarId = familyMember.googleCalendar?.selectedCalendarId || familyMember.email;
        const parentProfile = household.memberProfiles.find(
            p => p.familyMemberId.toString() === userId.toString()
        );
        eventColor = parentProfile?.profileColor || '#3B82F6';
        console.log(`[Calendar Routing] No attendees → Parent's calendar (${targetCalendarId})`);

    } else if (attendees.length === 1) {
        // Single attendee → Their calendar with their color
        console.log('[Calendar Routing] Looking up attendee:', attendees[0]);
        const attendeeMember = await FamilyMember.findById(attendees[0]);
        console.log('[Calendar Routing] Attendee member found:', !!attendeeMember);
        const attendeeProfile = household.memberProfiles.find(
            p => p.familyMemberId.toString() === attendees[0].toString()
        );
        console.log('[Calendar Routing] Attendee profile found:', !!attendeeProfile);

        if (!attendeeMember || !attendeeProfile) {
            console.error('[Calendar Routing] Attendee not found - member:', !!attendeeMember, 'profile:', !!attendeeProfile);
            console.error('[Calendar Routing] Available household members:', household.memberProfiles.map(p => ({
                id: p.familyMemberId.toString(),
                displayName: p.displayName,
                role: p.role
            })));
            return next(new AppError('Attendee not found', 404));
        }

        targetCalendarId = attendeeMember.googleCalendar?.selectedCalendarId || familyMember.email;
        eventColor = attendeeProfile.profileColor;
        // googleCalendarTitle = `${title} (${attendeeProfile.displayName})`; // Removed per user request
        googleCalendarTitle = title;

        console.log(`[Calendar Routing] Single attendee (${attendeeProfile.displayName}) → Their calendar (${targetCalendarId}) with color ${eventColor}`);

    } else {
        // Multiple attendees → Family calendar with family color
        calendarType = 'family';
        targetCalendarId = household.familyCalendarId || familyMember.googleCalendar?.selectedCalendarId || familyMember.email;
        eventColor = household.familyColor || '#8B5CF6';

        // Append all attendee names
        const attendeeMembers = await FamilyMember.find({
            _id: { $in: attendees }
        });
        const attendeeNames = attendeeMembers
            .map((m: any) => household.memberProfiles.find(p => p.familyMemberId.toString() === m._id.toString())?.displayName || m.firstName)
            .join(', ');

        googleCalendarTitle = `${title} (${attendeeNames})`;
        console.log(`[Calendar Routing] Multiple attendees → Family calendar (${targetCalendarId}) with color ${eventColor}`);
    }

    // Step 1: Save to DB with CLEAN title and color
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
        calendarType,
        color: eventColor, // <--- CRITICAL FIX: Save the determined color
    });

    console.log(`[DB] Event created: ${event._id} (title: "${title}", color: ${eventColor})`);

    // Step 2: Sync to Google Calendar with APPENDED title and COLOR
    try {
        await ensureValidToken(familyMember);

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        console.log(`[Google Calendar] Creating event "${googleCalendarTitle}" on calendar ${targetCalendarId}`);

        // Map hex color to Google Calendar color ID
        const COLOR_MAP: { [key: string]: string } = {
            // Tailwind Colors (Web/Legacy Fallbacks)
            '#EF4444': '11', // Red
            '#F97316': '6',  // Orange
            '#F59E0B': '5',  // Amber
            '#10B981': '10', // Emerald
            '#06B6D4': '7',  // Cyan
            '#3B82F6': '9',  // Blue
            '#6366F1': '1',  // Indigo
            '#8B5CF6': '3',  // Violet
            '#EC4899': '4',  // Pink
            '#6B7280': '8',  // Gray

            // Standard Google Calendar Colors (Exact Matches)
            '#7986CB': '1',  // Lavender
            '#33B679': '2',  // Sage
            '#8E24AA': '3',  // Grape
            '#E67C73': '4',  // Flamingo
            '#F6BF26': '5',  // Banana
            '#F4511E': '6',  // Tangerine
            '#039BE5': '7',  // Peacock
            '#616161': '8',  // Graphite
            '#3F51B5': '9',  // Blueberry
            '#0B8043': '10', // Basil
            '#D50000': '11', // Tomato
        };
        const googleColorId = COLOR_MAP[eventColor.toUpperCase()] || undefined; // If no match, undefined = inherit calendar color

        const googleEvent: any = {
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

        // Only add colorId if we found a valid mapping
        if (googleColorId) {
            googleEvent.colorId = googleColorId;
        }

        const response = await calendar.events.insert({
            calendarId: targetCalendarId,
            requestBody: googleEvent,
        });

        // Update DB event with Google Calendar ID
        event.googleEventId = response.data.id!;
        await event.save();

        console.log(`[Google Calendar] ✅ Event created! ID: ${response.data.id}, Link: ${response.data.htmlLink}`);

        res.status(201).json({
            status: 'success',
            data: {
                ...response.data,
                color: eventColor, // Include color in response for app display
            },
        });
    } catch (error: any) {
        console.error('Google Calendar sync error:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            errors: error.errors,
            stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        });

        // Event is saved in DB but Google sync failed
        // Return success but note the sync failure
        res.status(201).json({
            status: 'success',
            message: 'Event created locally. Google Calendar sync will retry.',
            data: {
                id: (event as any)._id.toString(),
                summary: event.title,
                color: eventColor, // Include color even on failure
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
