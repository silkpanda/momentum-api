import { google } from 'googleapis';
import { Types } from 'mongoose';
import FamilyMember from '../models/FamilyMember';
import Event from '../models/Event';
import Household from '../models/Household';
import AppError from '../utils/AppError';
import { ensureValidToken, getOAuth2Client } from './googleAuthService';

const oauth2Client = getOAuth2Client();

interface CreateEventData {
    title: string;
    startDate: string;
    endDate: string;
    allDay: boolean;
    location?: string;
    notes?: string;
    attendees?: string[];
}

interface UpdateEventData {
    title?: string;
    startDate?: string;
    endDate?: string;
    allDay?: boolean;
    location?: string;
    notes?: string;
    attendees?: string[];
}

// HELPER: Ensure a member has a linked calendar ID
const ensureMemberCalendarLink = async (
    member: any,
    parentMember: any,
    oauthClient: any
): Promise<string | undefined> => {
    console.log(`[Calendar Link] Checking link for member: ${member.firstName} (ID: ${member._id})`);

    if (member.googleCalendar?.selectedCalendarId) {
        console.log(`[Calendar Link] Member already has ID: ${member.googleCalendar.selectedCalendarId}`);
        return member.googleCalendar.selectedCalendarId;
    }

    // If no ID, try to find a calendar with their name
    console.log(`[Calendar Link] Missing ID for ${member.firstName}. Scanning parent calendars...`);
    try {
        const calendar = google.calendar({ version: 'v3', auth: oauthClient });
        const listRes = await calendar.calendarList.list({ minAccessRole: 'writer' });
        const calendars = listRes.data.items || [];

        console.log(`[Calendar Link] Found ${calendars.length} calendars. Summaries: ${calendars.map(c => `'${c.summary}'`).join(', ')}`);

        // Match by summary (Name) - Case insensitive scan
        const match = calendars.find(c =>
            c.summary?.trim().toLowerCase() === member.firstName.trim().toLowerCase() ||
            c.summary?.trim().toLowerCase() === member.displayName?.trim().toLowerCase()
        );

        if (match && match.id) {
            console.log(`[Calendar Link] FOUND match: '${match.summary}' (${match.id}). Linking to profile.`);

            // Save to member profile efficiently
            if (!member.googleCalendar) member.googleCalendar = {};
            member.googleCalendar.selectedCalendarId = match.id;
            await member.save();

            return match.id;
        } 
            console.log(`[Calendar Link] NO MATCH found for '${member.firstName}' or '${member.displayName}'`);
        
    } catch (err) {
        console.error('[Calendar Link] Failed to scan calendars:', err);
    }

    return undefined;
};

export const createEvent = async (userId: string, householdId: string, eventData: CreateEventData) => {
    const { title, startDate, endDate, allDay, location, notes, attendees } = eventData;

    const familyMember = await FamilyMember.findById(userId);
    if (!familyMember) throw new AppError('User not found', 404);

    const household = await Household.findById(householdId);
    if (!household) throw new AppError('Household not found', 404);

    // Determine calendar routing and color
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

    } else if (attendees.length === 1) {
        // Single attendee → Their calendar
        const attendeeMember = await FamilyMember.findById(attendees[0]);
        const attendeeProfile = household.memberProfiles.find(
            p => p.familyMemberId.toString() === attendees[0].toString()
        );

        if (!attendeeMember || !attendeeProfile) {
            throw new AppError('Attendee not found', 404);
        }

        // Try to heal link if missing
        const healedCalendarId = await ensureMemberCalendarLink(attendeeMember, familyMember, oauth2Client);
        targetCalendarId = healedCalendarId || familyMember.googleCalendar?.selectedCalendarId || familyMember.email;

        eventColor = attendeeProfile.profileColor;
        googleCalendarTitle = title;

    } else {
        // Multiple attendees → Family calendar
        calendarType = 'family';
        targetCalendarId = household.familyCalendarId || familyMember.googleCalendar?.selectedCalendarId || familyMember.email;
        eventColor = household.familyColor || '#8B5CF6';

        const attendeeMembers = await FamilyMember.find({
            _id: { $in: attendees }
        });
        const attendeeNames = attendeeMembers
            .map((m: any) => household.memberProfiles.find(p => p.familyMemberId.toString() === m._id.toString())?.displayName || m.firstName)
            .join(', ');

        googleCalendarTitle = `${title} (${attendeeNames})`;
    }

    // DB Create
    const event = await Event.create({
        householdId,
        createdBy: userId,
        title,
        description: notes,
        location,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        allDay: allDay || false,
        attendees: attendees ? attendees.map(id => new Types.ObjectId(id)) : [],
        calendarType,
        color: eventColor,
        googleCalendarId: targetCalendarId, // Save the target calendar ID
    });


    // Google Sync
    let googleResponse: any = null;
    let syncError: any = null;

    try {
        await ensureValidToken(familyMember);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const COLOR_MAP: { [key: string]: string } = {
            '#EF4444': '11', '#F97316': '6', '#F59E0B': '5', '#10B981': '10',
            '#06B6D4': '7', '#3B82F6': '9', '#6366F1': '1', '#8B5CF6': '3',
            '#EC4899': '4', '#6B7280': '8', '#7986CB': '1', '#33B679': '2',
            '#8E24AA': '3', '#E67C73': '4', '#F6BF26': '5', '#F4511E': '6',
            '#039BE5': '7', '#616161': '8', '#3F51B5': '9', '#0B8043': '10',
            '#D50000': '11',
        };
        const googleColorId = COLOR_MAP[eventColor.toUpperCase()] || undefined;

        const googleEvent: any = {
            summary: googleCalendarTitle,
            location,
            description: notes,
            start: allDay
                ? { date: new Date(startDate).toISOString().split('T')[0] }
                : { dateTime: new Date(startDate).toISOString() },
            end: allDay
                ? { date: new Date(endDate).toISOString().split('T')[0] }
                : { dateTime: new Date(endDate).toISOString() },
        };

        if (googleColorId) {
            googleEvent.colorId = googleColorId;
        }

        const response = await calendar.events.insert({
            calendarId: targetCalendarId,
            requestBody: googleEvent,
        });

        event.googleEventId = response.data.id!;
        await event.save();
        googleResponse = response.data;

    } catch (error: any) {
        console.error('Google Calendar sync error:', error);
        syncError = error;
    }

    return { event, googleResponse, syncError, eventColor };
};

export const updateEvent = async (userId: string, householdId: string, eventId: string, updateData: UpdateEventData) => {
    const familyMember = await FamilyMember.findById(userId);
    if (!familyMember) throw new AppError('User not found', 404);

    const event = await Event.findById(eventId);
    if (!event) throw new AppError('Event not found', 404);
    if (event.householdId.toString() !== householdId) throw new AppError('Unauthorized', 403);

    const household = await Household.findById(householdId);
    if (!household) throw new AppError('Household not found', 404);

    const { title, startDate, endDate, allDay, location, notes, attendees } = updateData;

    // Routing Logic
    let targetCalendarId: string;
    let eventColor: string;
    let googleCalendarTitle = title || event.title;
    let calendarType: 'personal' | 'family' = 'personal';
    const finalAttendees = attendees !== undefined ? attendees : event.attendees;

    if (!finalAttendees || finalAttendees.length === 0) {
        targetCalendarId = familyMember.googleCalendar?.selectedCalendarId || familyMember.email;
        const parentProfile = household.memberProfiles.find(
            p => p.familyMemberId.toString() === userId.toString()
        );
        eventColor = parentProfile?.profileColor || '#3B82F6';
    } else if (finalAttendees.length === 1) {
        const attendeeMember = await FamilyMember.findById(finalAttendees[0]);
        const attendeeProfile = household.memberProfiles.find(
            p => p.familyMemberId.toString() === finalAttendees[0].toString()
        );
        if (!attendeeMember || !attendeeProfile) throw new AppError('Attendee not found', 404);

        // Try to heal link if missing
        const healedCalendarId = await ensureMemberCalendarLink(attendeeMember, familyMember, oauth2Client);
        targetCalendarId = healedCalendarId || familyMember.googleCalendar?.selectedCalendarId || familyMember.email;

        eventColor = attendeeProfile.profileColor;
        googleCalendarTitle = title || event.title;
    } else {
        calendarType = 'family';
        targetCalendarId = household.familyCalendarId || familyMember.googleCalendar?.selectedCalendarId || familyMember.email;
        eventColor = household.familyColor || '#8B5CF6';
        const attendeeMembers = await FamilyMember.find({ _id: { $in: finalAttendees } });
        const attendeeNames = attendeeMembers
            .map((m: any) => household.memberProfiles.find(p => p.familyMemberId.toString() === m._id.toString())?.displayName || m.firstName)
            .join(', ');
        googleCalendarTitle = `${title || event.title} (${attendeeNames})`;
    }

    // Capture Original Location BEFORE updates
    const originalGoogleCalendarId = event.googleCalendarId || familyMember.googleCalendar?.selectedCalendarId || familyMember.email;

    // DB Update
    if (title !== undefined) event.title = title;
    if (startDate !== undefined) event.startDate = new Date(startDate);
    if (endDate !== undefined) event.endDate = new Date(endDate);
    if (allDay !== undefined) event.allDay = allDay;
    if (location !== undefined) event.location = location;
    if (notes !== undefined) event.description = notes;
    if (attendees !== undefined) event.attendees = attendees.map(id => new Types.ObjectId(id));
    event.calendarType = calendarType;
    event.color = eventColor;
    event.googleCalendarId = targetCalendarId; // Update target calendar ID
    await event.save();


    // Google Sync
    let googleResponse: any = null;
    let syncError: any = null;

    if (event.googleEventId) {
        try {
            await ensureValidToken(familyMember);
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

            // Determine the current calendar ID from the SNAPSHOT taken before DB updates
            const currentCalendarId = originalGoogleCalendarId;
            let calendarIdToUpdate = currentCalendarId;

            console.log('--- [Move Logic Diagnostic] ---');
            console.log('Event ID:', event._id);
            console.log('Google Event ID:', event.googleEventId);
            console.log('Current DB Calendar ID:', event.googleCalendarId);
            console.log('Resolved Current ID:', currentCalendarId);
            console.log('Resolved Target ID:', targetCalendarId);
            console.log('Ids Match?', currentCalendarId === targetCalendarId);
            console.log('-------------------------------');

            // HELPER: Recover lost event location
            const recoverEventLocation = async (missingEventId: string): Promise<string | null> => {
                console.log(`[Recovery] Attempting to find event ${missingEventId} in all user calendars...`);
                try {
                    const calendarList = await calendar.calendarList.list({ minAccessRole: 'writer' });
                    const calendars = calendarList.data.items || [];

                    for (const cal of calendars) {
                        try {
                            const foundEvent = await calendar.events.get({
                                calendarId: cal.id!,
                                eventId: missingEventId,
                            });
                            if (foundEvent.data) {
                                console.log(`[Recovery] FOUND event in calendar: ${cal.id}`);
                                return cal.id || null;
                            }
                        } catch (err) {
                            // Not in this calendar, continue
                        }
                    }
                } catch (listErr) {
                    console.error('[Recovery] Failed to list calendars:', listErr);
                }
                console.log('[Recovery] Event not found in any calendar.');
                return null;
            };

            // Check if we need to MOVE the event to a different calendar
            if (currentCalendarId && targetCalendarId && currentCalendarId !== targetCalendarId) {
                console.log(`[Move Required] Event ${event.googleEventId} needs moving from ${currentCalendarId} to ${targetCalendarId}`);
                try {
                    const moveResponse = await calendar.events.move({
                        calendarId: currentCalendarId,
                        eventId: event.googleEventId,
                        destination: targetCalendarId,
                    });

                    if (moveResponse.data.id) event.googleEventId = moveResponse.data.id;
                    calendarIdToUpdate = targetCalendarId; // Move succeeded, update target
                    console.log('✅ Event moved successfully');
                } catch (moveError: any) {
                    console.error('❌ Failed to move event:', moveError.message);

                    // If 404, the event might not be on 'currentCalendarId'. Try to find it.
                    if (moveError.code === 404 || (moveError.errors && moveError.errors[0]?.reason === 'notFound')) {
                        const realCalendarId = await recoverEventLocation(event.googleEventId);
                        if (realCalendarId && realCalendarId !== currentCalendarId) {
                            // Retry move from real location
                            console.log(`[Retry Move] Retrying move from real location: ${realCalendarId} -> ${targetCalendarId}`);
                            try {
                                const retryMoveResponse = await calendar.events.move({
                                    calendarId: realCalendarId,
                                    eventId: event.googleEventId,
                                    destination: targetCalendarId,
                                });
                                if (retryMoveResponse.data.id) event.googleEventId = retryMoveResponse.data.id;
                                calendarIdToUpdate = targetCalendarId;
                                event.googleCalendarId = targetCalendarId; // Correct the DB immediately
                                await event.save();
                                console.log('✅ Retry Move successful');
                            } catch (retryErr) {
                                console.error('Retry move failed:', retryErr);
                                // Fallback to updating original (found) location
                                calendarIdToUpdate = realCalendarId;
                                event.googleCalendarId = realCalendarId; // At least correct the location in DB
                                await event.save();
                            }
                        } else {
                            console.warn('⚠️ Could not recover event location. Fallback to original intent (risky).');
                        }
                    } else {
                        // MANUAL MOVE STRATEGY: API Move failed (likely permissions), try Clone & Delete
                        console.log(`[Manual Move] API move failed. Attempting Clone & Delete: ${currentCalendarId} -> ${targetCalendarId}`);
                        try {
                            // 1. Get original event to preserve details not in DB
                            const originalEventRes = await calendar.events.get({
                                calendarId: currentCalendarId,
                                eventId: event.googleEventId,
                            });
                            const originalEvent = originalEventRes.data;

                            // 2. Insert copy to new calendar
                            // Merge original details with our DB updates
                            const newEventBody = {
                                ...originalEvent,
                                summary: googleCalendarTitle, // Use updated title
                                location: event.location,
                                description: event.description,
                                start: event.allDay
                                    ? { date: event.startDate.toISOString().split('T')[0] }
                                    : { dateTime: event.startDate.toISOString() },
                                end: event.allDay
                                    ? { date: event.endDate.toISOString().split('T')[0] }
                                    : { dateTime: event.endDate.toISOString() },
                                id: undefined, // Clear ID to let Google generate new one
                                htmlLink: undefined,
                                iCalUID: undefined,
                                attendees: undefined // manage attendees separately if needed, but here we likely want new logic
                            };

                            // Re-apply correct color
                            const COLOR_MAP_MANUAL: { [key: string]: string } = {
                                '#EF4444': '11', '#F97316': '6', '#F59E0B': '5', '#10B981': '10',
                                '#06B6D4': '7', '#3B82F6': '9', '#6366F1': '1', '#8B5CF6': '3',
                                '#EC4899': '4', '#6B7280': '8', '#7986CB': '1', '#33B679': '2',
                                '#8E24AA': '3', '#E67C73': '4', '#F6BF26': '5', '#F4511E': '6',
                                '#039BE5': '7', '#616161': '8', '#3F51B5': '9', '#0B8043': '10',
                                '#D50000': '11',
                            };
                            if (eventColor && COLOR_MAP_MANUAL[eventColor.toUpperCase()]) {
                                newEventBody.colorId = COLOR_MAP_MANUAL[eventColor.toUpperCase()];
                            }

                            const insertResponse = await calendar.events.insert({
                                calendarId: targetCalendarId,
                                requestBody: newEventBody,
                            });

                            // 3. Update DB with NEW ID
                            if (insertResponse.data.id) {
                                event.googleEventId = insertResponse.data.id;
                                event.googleCalendarId = targetCalendarId;
                                calendarIdToUpdate = targetCalendarId; // Ensure subsequent patch targets correct cal
                                console.log(`✅ Manual Move (Insert) successful. New ID: ${insertResponse.data.id}`);

                                // 4. Delete original event (Clean up)
                                try {
                                    await calendar.events.delete({
                                        calendarId: currentCalendarId,
                                        eventId: originalEventRes.data.id!,
                                    });
                                    console.log('✅ Manual Move (Delete) successful');
                                } catch (delErr) {
                                    console.warn('⚠️ Manual Move: Failed to delete original event (duplicate may exist):', delErr);
                                }

                                await event.save();
                            }

                        } catch (manualErr: any) {
                            console.error('❌ Manual Move failed:', manualErr.message);
                            console.warn('⚠️ Falling back to updating event on original calendar.');
                        }
                    }
                }
            } else if (currentCalendarId === targetCalendarId) {
                    calendarIdToUpdate = targetCalendarId;
                }

            const COLOR_MAP: { [key: string]: string } = {
                '#EF4444': '11', '#F97316': '6', '#F59E0B': '5', '#10B981': '10',
                '#06B6D4': '7', '#3B82F6': '9', '#6366F1': '1', '#8B5CF6': '3',
                '#EC4899': '4', '#6B7280': '8', '#7986CB': '1', '#33B679': '2',
                '#8E24AA': '3', '#E67C73': '4', '#F6BF26': '5', '#F4511E': '6',
                '#039BE5': '7', '#616161': '8', '#3F51B5': '9', '#0B8043': '10',
                '#D50000': '11',
            };
            const googleColorId = COLOR_MAP[eventColor.toUpperCase()] || undefined;

            const googleEvent: any = {
                summary: googleCalendarTitle,
                location: event.location,
                description: event.description,
                start: event.allDay
                    ? { date: event.startDate.toISOString().split('T')[0] }
                    : { dateTime: event.startDate.toISOString() },
                end: event.allDay
                    ? { date: event.endDate.toISOString().split('T')[0] }
                    : { dateTime: event.endDate.toISOString() },
            };

            if (googleColorId) googleEvent.colorId = googleColorId;

            console.log(`[Patching Event] ID: ${event.googleEventId} on Calendar: ${calendarIdToUpdate}`);

            try {
                const response = await calendar.events.patch({
                    calendarId: calendarIdToUpdate,
                    eventId: event.googleEventId,
                    requestBody: googleEvent,
                });
                googleResponse = response.data;
            } catch (patchError: any) {
                console.error('Patch failed:', patchError.message);
                if (patchError.code === 404 || (patchError.errors && patchError.errors[0]?.reason === 'notFound')) {
                    // One last try: Did we fail because we're looking at the wrong calendar?
                    const realCalendarId = await recoverEventLocation(event.googleEventId);
                    if (realCalendarId && realCalendarId !== calendarIdToUpdate) {
                        console.log(`[Retry Patch] Retrying patch on real calendar: ${realCalendarId}`);
                        const retryResponse = await calendar.events.patch({
                            calendarId: realCalendarId,
                            eventId: event.googleEventId,
                            requestBody: googleEvent,
                        });
                        googleResponse = retryResponse.data;
                        calendarIdToUpdate = realCalendarId; // For DB save below
                    }
                } else {
                    throw patchError;
                }
            }

            // Final DB Save of location
            if (calendarIdToUpdate) {
                event.googleCalendarId = calendarIdToUpdate;
                await event.save();
            }

        } catch (error: any) {
            console.error('Google Calendar update error:', error);
            syncError = error;
        }
    }

    return { event, googleResponse, syncError, eventColor };
};

export const deleteEvent = async (userId: string, householdId: string, eventId: string) => {
    const familyMember = await FamilyMember.findById(userId);
    if (!familyMember) throw new AppError('User not found', 404);

    const event = await Event.findById(eventId);
    if (!event) throw new AppError('Event not found', 404);
    if (event.householdId.toString() !== householdId) throw new AppError('Unauthorized', 403);

    // Delete from Google Calendar
    if (event.googleEventId && event.googleCalendarId) {
        try {
            await ensureValidToken(familyMember);
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
            await calendar.events.delete({
                calendarId: event.googleCalendarId,
                eventId: event.googleEventId,
            });
            console.log(`[Google Calendar] Event deleted: ${event.googleEventId}`);
        } catch (error) {
            console.error('Google Calendar delete error:', error);
            // Valid to ignore 404/410 (already deleted)
        }
    }

    // Delete from DB
    await Event.findByIdAndDelete(eventId);

    return { success: true };
};
