// src/controllers/eventController.ts
import { Response } from 'express';
import asyncHandler from 'express-async-handler';
import { Types } from 'mongoose';
import Event from '../models/Event';
import Household from '../models/Household';
import FamilyMember from '../models/FamilyMember';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import AppError from '../utils/AppError';
import { io } from '../server';
import {
    createGoogleCalendarEvent,
    updateGoogleCalendarEvent,
    deleteGoogleCalendarEvent,
} from '../services/googleCalendarService';

// Color mapping helper
const COLOR_MAP: { [key: string]: string } = {
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
};

function getClosestGoogleColor(hexColor: string): string {
    if (COLOR_MAP[hexColor]) return COLOR_MAP[hexColor];
    return '9'; // Default to Blue
}

/**
 * @desc    Create a new event
 * @route   POST /api/v1/events
 * @access  Private
 */
export const createEvent = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const {
            title,
            description,
            location,
            videoLink,
            startDate,
            endDate,
            allDay,
            attendees, // Array of member IDs
            isRecurring,
            recurrenceType,
            reminderMinutes,
        } = req.body;

        const userId = req.user?._id as Types.ObjectId;
        const householdId = req.householdId;

        if (!userId || !householdId) {
            throw new AppError('Authentication error', 401);
        }

        if (!title || !startDate || !endDate) {
            throw new AppError('Title, start date, and end date are required', 400);
        }

        // Fetch household to get family color and calendar ID
        const household = await Household.findById(householdId);
        if (!household) {
            throw new AppError('Household not found', 404);
        }

        // Determine calendar type based on number of attendees
        let calendarType: 'personal' | 'family' = 'personal';
        let finalTitle = title;

        if (attendees && attendees.length > 1) {
            // Multi-member event -> Family calendar
            calendarType = 'family';

            // Append attendee names to title
            const attendeeMembers = await FamilyMember.find({
                _id: { $in: attendees },
            }).select('firstName');

            const attendeeNames = attendeeMembers
                .map((m) => m.firstName)
                .join(', ');

            finalTitle = `${title} (${attendeeNames})`;
        }

        // Create event in database
        const event = await Event.create({
            householdId,
            title: finalTitle,
            description,
            location,
            videoLink,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            allDay: allDay || false,
            attendees: attendees || [],
            isRecurring: isRecurring || false,
            recurrenceType,
            reminderMinutes,
            calendarType,
            createdBy: userId,
        });

        // Sync to Google Calendar
        try {
            let calendarIdToUse: string | null = null;
            let colorId: string | undefined;
            let accessToken: string | undefined;
            let refreshToken: string | undefined;

            if (calendarType === 'personal') {
                // Sync to user's personal calendar
                const user = await FamilyMember.findById(userId).select('+googleCalendar');
                if (user?.googleCalendar?.selectedCalendarId && user.googleCalendar.accessToken) {
                    calendarIdToUse = user.googleCalendar.selectedCalendarId;
                    accessToken = user.googleCalendar.accessToken;
                    refreshToken = user.googleCalendar.refreshToken;

                    // Get user's profile color for the event
                    const memberProfile = household.memberProfiles.find(
                        (p) => p.familyMemberId.toString() === userId.toString()
                    );
                    if (memberProfile?.profileColor) {
                        colorId = getClosestGoogleColor(memberProfile.profileColor);
                    }
                }
            } else {
                // Sync to family calendar
                if (household.familyCalendarId) {
                    calendarIdToUse = household.familyCalendarId;

                    // Use family color
                    if (household.familyColor) {
                        colorId = getClosestGoogleColor(household.familyColor);
                    }

                    // Use the creator's tokens to create the event
                    const user = await FamilyMember.findById(userId).select('+googleCalendar');
                    if (user?.googleCalendar?.accessToken) {
                        accessToken = user.googleCalendar.accessToken;
                        refreshToken = user.googleCalendar.refreshToken;
                    }
                }
            }

            // Create event in Google Calendar if we have the necessary credentials
            if (calendarIdToUse && accessToken) {
                // Convert recurrence type to RRULE format
                let recurrenceRules: string[] | undefined;
                if (isRecurring && recurrenceType) {
                    const freq = recurrenceType.toUpperCase();
                    recurrenceRules = [`RRULE:FREQ=${freq}`];
                }

                const { googleEventId } = await createGoogleCalendarEvent(
                    accessToken,
                    calendarIdToUse,
                    {
                        title: finalTitle,
                        description: videoLink ? `${description || ''}\n\nVideo: ${videoLink}` : description,
                        location,
                        startDate: new Date(startDate),
                        endDate: new Date(endDate),
                        allDay: allDay || false,
                        colorId,
                        recurrence: recurrenceRules,
                        reminderMinutes,
                    },
                    refreshToken
                );

                // Update event with Google Calendar ID
                event.googleEventId = googleEventId;
                await event.save();

                console.log(`✅ Event synced to Google Calendar: ${googleEventId}`);
            } else {
                console.log('⚠️ Google Calendar sync skipped - no calendar configured');
            }
        } catch (syncError: any) {
            console.error('Google Calendar sync error:', syncError);
            // Don't fail the whole operation if Google sync fails
            // Event is still created in our database
        }

        // Emit real-time update
        io.to(householdId.toString()).emit('event_created', event);

        res.status(201).json({
            status: 'success',
            data: event,
        });
    },
);

/**
 * @desc    Get all events for a household
 * @route   GET /api/v1/events
 * @access  Private
 */
export const getEvents = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const householdId = req.householdId;

        if (!householdId) {
            throw new AppError('Household context not found', 401);
        }

        const { startDate, endDate, memberId } = req.query;

        // Build query
        const query: any = { householdId };

        // Filter by date range if provided
        if (startDate || endDate) {
            query.startDate = {};
            if (startDate) {
                query.startDate.$gte = new Date(startDate as string);
            }
            if (endDate) {
                query.startDate.$lte = new Date(endDate as string);
            }
        }

        // Filter by member if provided
        if (memberId) {
            query.attendees = memberId;
        }

        const events = await Event.find(query)
            .populate('attendees', 'firstName profileColor')
            .populate('createdBy', 'firstName')
            .sort({ startDate: 1 });

        res.status(200).json({
            status: 'success',
            data: events,
        });
    },
);

/**
 * @desc    Get a single event by ID
 * @route   GET /api/v1/events/:id
 * @access  Private
 */
export const getEvent = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const householdId = req.householdId;

        const event = await Event.findById(id)
            .populate('attendees', 'firstName profileColor')
            .populate('createdBy', 'firstName');

        if (!event) {
            throw new AppError('Event not found', 404);
        }

        // Verify event belongs to user's household
        if (event.householdId.toString() !== householdId?.toString()) {
            throw new AppError('Unauthorized', 403);
        }

        res.status(200).json({
            status: 'success',
            data: event,
        });
    },
);

/**
 * @desc    Update an event
 * @route   PATCH /api/v1/events/:id
 * @access  Private
 */
export const updateEvent = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const householdId = req.householdId;
        const userId = req.user?._id as Types.ObjectId;

        const event = await Event.findById(id);

        if (!event) {
            throw new AppError('Event not found', 404);
        }

        // Verify event belongs to user's household
        if (event.householdId.toString() !== householdId?.toString()) {
            throw new AppError('Unauthorized', 403);
        }

        const {
            title,
            description,
            location,
            videoLink,
            startDate,
            endDate,
            allDay,
            attendees,
            isRecurring,
            recurrenceType,
            reminderMinutes,
        } = req.body;

        // Update fields
        if (title !== undefined) event.title = title;
        if (description !== undefined) event.description = description;
        if (location !== undefined) event.location = location;
        if (videoLink !== undefined) event.videoLink = videoLink;
        if (startDate !== undefined) event.startDate = new Date(startDate);
        if (endDate !== undefined) event.endDate = new Date(endDate);
        if (allDay !== undefined) event.allDay = allDay;
        if (isRecurring !== undefined) event.isRecurring = isRecurring;
        if (recurrenceType !== undefined) event.recurrenceType = recurrenceType;
        if (reminderMinutes !== undefined) event.reminderMinutes = reminderMinutes;

        // Handle attendee changes
        if (attendees !== undefined) {
            event.attendees = attendees;

            // Re-evaluate calendar type
            const oldCalendarType = event.calendarType;
            const newCalendarType = attendees.length > 1 ? 'family' : 'personal';

            if (oldCalendarType !== newCalendarType) {
                event.calendarType = newCalendarType;

                // TODO: Move event between calendars in Google Calendar
                // if (oldCalendarType === 'personal' && newCalendarType === 'family') {
                //   // Delete from personal, create in family
                // } else if (oldCalendarType === 'family' && newCalendarType === 'personal') {
                //   // Delete from family, create in personal
                // }
            }

            // Update title with attendee names if multi-member
            if (newCalendarType === 'family' && title) {
                const attendeeMembers = await FamilyMember.find({
                    _id: { $in: attendees },
                }).select('firstName');

                const attendeeNames = attendeeMembers
                    .map((m) => m.firstName)
                    .join(', ');

                event.title = `${title} (${attendeeNames})`;
            }
        }

        await event.save();

        // Sync changes to Google Calendar
        if (event.googleEventId) {
            try {
                let calendarIdToUse: string | null = null;
                let accessToken: string | undefined;
                let refreshToken: string | undefined;
                let colorId: string | undefined;

                // We assume the type hasn't changed for this simple sync, 
                // or if it has, we are just updating the event in the *original* calendar 
                // (moving calendars is out of scope for this MVP fix)
                const currentCalendarType = event.calendarType;

                const household = await Household.findById(householdId);

                if (currentCalendarType === 'personal') {
                    // Sync to user's personal calendar
                    // We need the tokens of the user who owns the event (createdBy)
                    // Or the current user if they are the owner. 
                    // To be safe, let's use the current user's tokens if they match the creator,
                    // otherwise we might not have permission if we are masquerading (not possible yet).

                    const user = await FamilyMember.findById(userId).select('+googleCalendar');
                    if (user?.googleCalendar?.selectedCalendarId && user.googleCalendar.accessToken) {
                        calendarIdToUse = user.googleCalendar.selectedCalendarId;
                        accessToken = user.googleCalendar.accessToken;
                        refreshToken = user.googleCalendar.refreshToken;

                        // Get user's profile color
                        if (household) {
                            const memberProfile = household.memberProfiles.find(
                                (p) => p.familyMemberId.toString() === userId.toString()
                            );
                            if (memberProfile?.profileColor) {
                                colorId = getClosestGoogleColor(memberProfile.profileColor);
                            }
                        }
                    }
                } else {
                    // Family Calendar
                    if (household && household.familyCalendarId) {
                        calendarIdToUse = household.familyCalendarId;
                        if (household.familyColor) {
                            colorId = getClosestGoogleColor(household.familyColor);
                        }

                        // Use current user's tokens
                        const user = await FamilyMember.findById(userId).select('+googleCalendar');
                        if (user?.googleCalendar?.accessToken) {
                            accessToken = user.googleCalendar.accessToken;
                            refreshToken = user.googleCalendar.refreshToken;
                        }
                    }
                }

                if (calendarIdToUse && accessToken) {
                    // Check if recurrence needs update
                    let recurrenceRules: string[] | undefined;
                    if (event.isRecurring && event.recurrenceType) {
                        const freq = event.recurrenceType.toUpperCase();
                        recurrenceRules = [`RRULE:FREQ=${freq}`];
                    }

                    await updateGoogleCalendarEvent(
                        accessToken,
                        calendarIdToUse,
                        event.googleEventId,
                        {
                            title: event.title,
                            description: event.videoLink ? `${event.description || ''}\n\nVideo: ${event.videoLink}` : event.description,
                            location: event.location,
                            startDate: event.startDate,
                            endDate: event.endDate,
                            allDay: event.allDay,
                            colorId,
                            recurrence: recurrenceRules,
                            reminderMinutes: event.reminderMinutes,
                        },
                        refreshToken
                    );
                    console.log(`✅ Event updated in Google Calendar: ${event.googleEventId}`);
                }

            } catch (error) {
                console.error('Failed to sync update to Google Calendar:', error);
                // We do not throw here to allow local update to succeed
            }
        }

        // Emit real-time update
        io.to(householdId.toString()).emit('event_updated', event);

        res.status(200).json({
            status: 'success',
            data: event,
        });
    },
);

/**
 * @desc    Delete an event
 * @route   DELETE /api/v1/events/:id
 * @access  Private
 */
export const deleteEvent = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const householdId = req.householdId;

        const event = await Event.findById(id);

        if (!event) {
            throw new AppError('Event not found', 404);
        }

        // Verify event belongs to user's household
        if (event.householdId.toString() !== householdId?.toString()) {
            throw new AppError('Unauthorized', 403);
        }

        // Delete from Google Calendar
        if (event.googleEventId) {
            try {
                let calendarIdToUse: string | null = null;
                let accessToken: string | undefined;
                let refreshToken: string | undefined;

                const household = await Household.findById(householdId);
                const currentCalendarType = event.calendarType;
                const userId = req.user?._id as Types.ObjectId; // Current user

                if (currentCalendarType === 'personal') {
                    const user = await FamilyMember.findById(userId).select('+googleCalendar');
                    if (user?.googleCalendar?.selectedCalendarId && user.googleCalendar.accessToken) {
                        calendarIdToUse = user.googleCalendar.selectedCalendarId;
                        accessToken = user.googleCalendar.accessToken;
                        refreshToken = user.googleCalendar.refreshToken;
                    }
                } else {
                    // Family
                    if (household && household.familyCalendarId) {
                        calendarIdToUse = household.familyCalendarId;
                        const user = await FamilyMember.findById(userId).select('+googleCalendar');
                        if (user?.googleCalendar?.accessToken) {
                            accessToken = user.googleCalendar.accessToken;
                            refreshToken = user.googleCalendar.refreshToken;
                        }
                    }
                }

                if (calendarIdToUse && accessToken) {
                    await deleteGoogleCalendarEvent(
                        accessToken,
                        calendarIdToUse,
                        event.googleEventId,
                        refreshToken
                    );
                    console.log(`✅ Event deleted from Google Calendar: ${event.googleEventId}`);
                }

            } catch (error) {
                console.error('Failed to deletet event from Google Calendar:', error);
                // Continue to delete locally
            }
        }

        await Event.findByIdAndDelete(id);

        // Emit real-time update
        io.to(householdId.toString()).emit('event_deleted', { id });

        res.status(204).json({
            status: 'success',
            data: null,
        });
    },
);
