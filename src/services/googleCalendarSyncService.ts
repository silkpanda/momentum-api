// =========================================================
// src/services/googleCalendarSyncService.ts
// Google Calendar Sync Engine
// =========================================================
import { google } from 'googleapis';
import { Types } from 'mongoose';
import Event from '../models/Event';
import Household from '../models/Household';
import FamilyMember from '../models/FamilyMember';
import { ensureValidToken, getOAuth2Client } from './googleAuthService';

const oauth2Client = getOAuth2Client();

/**
 * Sync Google Calendar events to MongoDB
 * Handles upserting new/updated events and pruning deleted events
 */
export const syncGoogleEventsToDb = async (
    householdId: string,
    googleEvents: any[],
    timeMin: string,
    timeMax?: string,
    calendarColorMap?: Map<string, string>
) => {
    try {
        const googleEventIdsSeen = new Set<string>();
        const bulkOps: any[] = [];

        // Pre-fetch existing events to check for recent local modifications (Race Condition Protection)
        const googleIds = googleEvents.map(e => e.id).filter(Boolean);
        const existingEvents = await Event.find({
            householdId,
            googleEventId: { $in: googleIds }
        }).select('googleEventId updatedAt');

        const recentUpdateThreshold = Date.now() - 5000; // 5 seconds
        const existingEventMap = new Map<string, any>();
        existingEvents.forEach(e => existingEventMap.set(e.googleEventId!, e));

        // 1. Prepare Bulk Upsert Operations
        for (const ge of googleEvents) {
            if (!ge.id) continue;
            googleEventIdsSeen.add(ge.id);

            // RACE CONDITION CHECK:
            // If the event was updated locally in the last 5 seconds, we ignore the incoming Google data
            // because it might be stale (e.g., event moved but Google API hasn't propagated read yet).
            const existing = existingEventMap.get(ge.id);
            if (existing && existing.updatedAt && existing.updatedAt.getTime() > recentUpdateThreshold) {
                console.log(`[SyncEngine] 🛡️ Protecting recently updated event: "${ge.summary}" (Local: ${existing.updatedAt.toISOString()})`);
                continue;
            }

            // Determine standardized color
            let eventColor = '#3B82F6'; // Default Blue
            if (ge._sourceCalendarId && calendarColorMap?.has(ge._sourceCalendarId)) {
                eventColor = calendarColorMap.get(ge._sourceCalendarId)!;
            }

            // Map Google Event -> DB Event
            const startDate = ge.start?.dateTime ? new Date(ge.start.dateTime) : (ge.start?.date ? new Date(ge.start.date) : new Date());
            const endDate = ge.end?.dateTime ? new Date(ge.end.dateTime) : (ge.end?.date ? new Date(ge.end.date) : new Date());
            const allDay = !ge.start?.dateTime;

            // Extract attendee IDs if possible (mapping emails to family members)
            // This is complex, so we'll skip for now or do a best-effort lookup if needed.
            // For now, we'll just store the raw attendees in the DB if we want, or rely on the sync.
            const attendeeIds: string[] = [];

            const updateDoc: any = {
                googleEventId: ge.id,
                title: ge.summary || '(No Title)',
                description: ge.description || '',
                location: ge.location || '',
                startDate,
                endDate,
                allDay,
                householdId,
                color: eventColor,
                googleCalendarId: ge._sourceCalendarId, // Save source calendar ID
                source: 'google',

                status: 'active',
                lastSyncedAt: new Date()
            };

            const op = {
                updateOne: {
                    filter: { googleEventId: ge.id, householdId }, // Find by GoogleID + Household
                    update: {
                        $set: updateDoc,
                        $setOnInsert: {
                            createdBy: null, // We can't easily map this for external events
                            createdAt: new Date(),
                        }
                    },
                    upsert: true
                }
            };
            bulkOps.push(op);
        }

        if (bulkOps.length > 0) {
            try {
                await Event.bulkWrite(bulkOps, { ordered: false });
                console.log(`[SyncEngine] Updated/Upserted ${bulkOps.length} events.`);
            } catch (bwError: any) {
                console.warn('[SyncEngine] Bulk write had validation errors:', bwError.message);
            }
        }

        // 2. Pruning (Scoped to successfully synced calendars)
        // Find events that belong to the calendars we just synced, but were NOT found in the sync result.

        // Helper to extract unique calendar IDs processed
        const syncedCalendarIds = Array.from(new Set(googleEvents.map(e => e._sourceCalendarId).filter(Boolean)));

        if (syncedCalendarIds.length === 0) {
            console.log('[SyncEngine] No calendars synced, skipping pruning to be safe.');
            return;
        }

        const pruningFilter: any = {
            householdId,
            googleEventId: { $ne: null, $exists: true },
            startDate: { $gte: new Date(timeMin) },
            // CRITICAL: Only prune events that belong to the calendars we actually checked
            googleCalendarId: { $in: syncedCalendarIds }
        };

        if (timeMax) {
            pruningFilter.startDate.$lte = new Date(timeMax);
        }

        const ghostEvents = await Event.find(pruningFilter).select('googleEventId title googleCalendarId');
        const eventsToDelete = ghostEvents.filter(e => !googleEventIdsSeen.has(e.googleEventId!));

        if (eventsToDelete.length > 0) {
            console.log(`[SyncEngine] Found ${eventsToDelete.length} ghost events to prune (scoped to ${syncedCalendarIds.length} calendars):`);
            eventsToDelete.forEach(e => {
                console.log(`  - "${e.title}" (ID: ${e.googleEventId})`);
            });
            const idsToDelete = eventsToDelete.map(e => e._id);
            await Event.deleteMany({ _id: { $in: idsToDelete } });
            console.log(`[SyncEngine] ✅ Pruned ${eventsToDelete.length} ghost events.`);
        } else {
            console.log(`[SyncEngine] No ghost events found for synced calendars (${syncedCalendarIds.join(', ')}).`);
        }


    } catch (err) {
        console.error('[SyncEngine] Critical Failure:', err);
    }
};

/**
 * Orchestrate fetching from Google, syncing to DB, and determining display colors
 */
export const performCalendarSync = async (
    familyMember: any,
    householdId: string,
    timeMinInput?: string,
    timeMaxInput?: string
) => {
    // 1. Setup Time Window
    let timeMin = timeMinInput;
    if (!timeMin) {
        // Fetch events from past month onwards (matches dashboard query)
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        oneMonthAgo.setDate(1); // Start of previous month
        timeMin = oneMonthAgo.toISOString();
    }

    // 2. Refresh Token
    await ensureValidToken(familyMember);

    // 3. Identify Calendars to Fetch
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const household = await Household.findById(householdId);

    const calendarIdsToFetch = new Set<string>();

    // Personal
    if (familyMember.googleCalendar?.selectedCalendarId) {
        calendarIdsToFetch.add(familyMember.googleCalendar.selectedCalendarId);
    } else {
        calendarIdsToFetch.add('primary');
    }

    // Family
    if (household?.familyCalendarId) {
        calendarIdsToFetch.add(household.familyCalendarId);
    }

    // Children
    let allMembers: any[] = [];
    if (household && household.memberProfiles) {
        const memberIds = household.memberProfiles.map((p: any) => p.familyMemberId);
        allMembers = await FamilyMember.find({ _id: { $in: memberIds } });

        allMembers.forEach(member => {
            if (member.googleCalendar?.selectedCalendarId) {
                calendarIdsToFetch.add(member.googleCalendar.selectedCalendarId);
            }
        });
    }

    console.log(`[Google Calendar] Fetching events from:`, Array.from(calendarIdsToFetch));

    // 4. Fetch Events Parallel
    let googleEvents: any[] = [];
    await Promise.all(Array.from(calendarIdsToFetch).map(async (targetCalendarId) => {
        try {
            const listParams: any = {
                calendarId: targetCalendarId,
                timeMin,
                maxResults: 100, // Limit per calendar
                singleEvents: true,
                orderBy: 'startTime',
            };

            if (timeMaxInput) {
                listParams.timeMax = timeMaxInput;
            }

            const response = await calendar.events.list(listParams);
            if (response.data.items) {
                const items = response.data.items.map((item: any) => ({ ...item, _sourceCalendarId: targetCalendarId }));
                googleEvents.push(...items);
            }
        } catch (err: any) {
            console.error(`[Google Calendar] Failed to fetch events from ${targetCalendarId}:`, err.message);
        }
    }));

    // Deduplicate
    const uniqueEventsMap = new Map();
    googleEvents.forEach(e => uniqueEventsMap.set(e.id, e));
    googleEvents = Array.from(uniqueEventsMap.values());

    console.log(`[Google Calendar] Total unique events found: ${googleEvents.length}`);

    // 5. Create Color Map
    const calendarColorMap = new Map<string, string>();
    if (household) {
        if (household.familyCalendarId && household.familyColor) {
            calendarColorMap.set(household.familyCalendarId, household.familyColor);
        }
        if (household.memberProfiles && allMembers.length > 0) {
            household.memberProfiles.forEach((profile: any) => {
                const member = allMembers.find(m => m._id.toString() === profile.familyMemberId.toString());
                if (member && member.googleCalendar?.selectedCalendarId && profile.profileColor) {
                    calendarColorMap.set(member.googleCalendar.selectedCalendarId, profile.profileColor);
                }
            });
        }
    }

    // 6. Persist to DB
    await syncGoogleEventsToDb(
        householdId,
        googleEvents,
        timeMin,
        timeMaxInput,
        calendarColorMap
    );

    // 7. Merge & Format Return Data
    const scopedDbEvents = await Event.find({
        householdId,
        startDate: { $gte: new Date(timeMin) } // Rough filter for what we just fetched
    }).sort({ startDate: 1 });

    const googleEventIdSet = new Set(googleEvents.map(e => e.id));

    // Unsynced / Missing from Google
    const unsyncedDbEvents = scopedDbEvents.filter((e: any) =>
        !e.googleEventId || !googleEventIdSet.has(e.googleEventId)
    );

    const REVERSE_COLOR_MAP: { [key: string]: string } = {
        '1': '#7986CB', '2': '#33B679', '3': '#8E24AA', '4': '#E67C73',
        '5': '#F6BF26', '6': '#F4511E', '7': '#039BE5', '8': '#616161',
        '9': '#3F51B5', '10': '#0B8043', '11': '#D50000',
    };

    // Map emails to Member IDs for attendee resolution
    const memberEmailMap = new Map<string, string>();
    allMembers.forEach(m => {
        memberEmailMap.set(m.email.toLowerCase(), m._id.toString());
    });

    const mapGoogleEvent = (e: any) => {
        // Map Google Attendees (email) -> Member IDs
        const attendeeIds = e.attendees?.map((a: any) =>
            memberEmailMap.get(a.email?.toLowerCase())
        ).filter(Boolean) || [];

        return {
            id: e.id,
            title: e.summary || 'No Title',
            summary: e.summary,
            description: e.description,
            location: e.location,
            color: REVERSE_COLOR_MAP[e.colorId] || '#3B82F6', // Default Blue
            start: e.start,
            end: e.end,
            allDay: !e.start.dateTime,
            attendees: attendeeIds,
        };
    };

    const mappedGoogleEvents = googleEvents.map(mapGoogleEvent);

    const formattedUnsyncedEvents = unsyncedDbEvents.map((e: any) => ({
        id: e._id.toString(),
        summary: e.title,
        title: e.title,
        description: e.description,
        location: e.location,
        color: e.color || '#3B82F6',
        start: e.allDay
            ? { date: e.startDate.toISOString().split('T')[0] }
            : { dateTime: e.startDate.toISOString() },
        end: e.allDay
            ? { date: e.endDate.toISOString().split('T')[0] }
            : { dateTime: e.endDate.toISOString() },
        allDay: e.allDay,
        attendees: e.attendees?.map((id: any) => id.toString()) || []
    }));

    const allEvents = [...mappedGoogleEvents, ...formattedUnsyncedEvents];
    console.log(`[Sync] Returning ${mappedGoogleEvents.length} Google events + ${formattedUnsyncedEvents.length} DB-only events`);

    return allEvents;
};
