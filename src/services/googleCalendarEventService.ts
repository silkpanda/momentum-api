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

        targetCalendarId = attendeeMember.googleCalendar?.selectedCalendarId || familyMember.email;
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
        attendees: attendees || [],
        calendarType,
        color: eventColor,
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
            location: location,
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
        targetCalendarId = attendeeMember.googleCalendar?.selectedCalendarId || familyMember.email;
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

    // DB Update
    if (title !== undefined) event.title = title;
    if (startDate !== undefined) event.startDate = new Date(startDate);
    if (endDate !== undefined) event.endDate = new Date(endDate);
    if (allDay !== undefined) event.allDay = allDay;
    if (location !== undefined) event.location = location;
    if (notes !== undefined) event.description = notes;
    if (attendees !== undefined) event.attendees = attendees;
    event.calendarType = calendarType;
    event.color = eventColor;
    await event.save();

    // Google Sync
    let googleResponse: any = null;
    let syncError: any = null;

    if (event.googleEventId) {
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

            const response = await calendar.events.patch({
                calendarId: targetCalendarId,
                eventId: event.googleEventId,
                requestBody: googleEvent,
            });
            googleResponse = response.data;

        } catch (error: any) {
            console.error('Google Calendar update error:', error);
            syncError = error;
        }
    }

    return { event, googleResponse, syncError, eventColor };
};
