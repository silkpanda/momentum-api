
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import Household from '../models/Household';
import Task from '../models/Task';
import StoreItem from '../models/StoreItem';
import Event from '../models/Event';
import AppError from '../utils/AppError';

export const getDashboardData = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user || !req.householdId) {
            return next(new AppError('User not authenticated or household not found', 401));
        }

        const userId = req.user.id;
        const {householdId} = req;

        // Fetch data in parallel (including calendar events)
        // Load events for current month ± 1 month for smooth navigation
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        oneMonthAgo.setDate(1); // Start of previous month

        const twoMonthsAhead = new Date();
        twoMonthsAhead.setMonth(twoMonthsAhead.getMonth() + 2);
        twoMonthsAhead.setDate(1); // Start of month after next

        const [household, tasks, storeItems, events] = await Promise.all([
            Household.findById(householdId).populate('memberProfiles.familyMemberId'),
            Task.find({ householdId }).populate('assignedTo.memberId').populate('createdBy'),
            StoreItem.find({ householdId }),
            Event.find({
                householdId,
                startDate: {
                    $gte: oneMonthAgo,
                    $lt: twoMonthsAhead
                }
            }).sort({ startDate: 1 })
        ]);

        if (!household) {
            return next(new AppError('Household not found', 404));
        }

        // Transform Household Data for UI (Matching BFF format)
        const transformedHousehold = {
            id: household._id,
            name: household.householdName,
            members: household.memberProfiles?.map((p: any) => ({
                id: p._id.toString(), // This is the Profile ID (Access Card ID)
                userId: (p.familyMemberId?._id || p.familyMemberId)?.toString(),
                firstName: p.displayName || p.familyMemberId?.firstName || 'Unknown',
                lastName: p.familyMemberId?.lastName || '',
                profileColor: p.profileColor,
                pointsTotal: p.pointsTotal,
                role: p.role,
                focusedTaskId: p.focusedTaskId,
                isLinkedChild: p.isLinkedChild || false
            })) || []
        };

        // Transform events to match calendar format with color normalization
        const transformedEvents = events.map((e: any) => {
            // Determine the correct color based on calendar type
            let eventColor = e.color || '#3B82F6'; // Default fallback

            if (e.calendarType === 'family') {
                // Family events use household family color
                eventColor = household.familyColor || '#8B5CF6';
            } else if (e.calendarType === 'personal' && e.attendees && e.attendees.length > 0) {
                // Personal events use the attendee's profile color
                const attendeeId = e.attendees[0]; // First attendee
                const attendeeProfile = household.memberProfiles?.find(
                    (p: any) => p.familyMemberId?._id?.toString() === attendeeId.toString() ||
                        p.familyMemberId?.toString() === attendeeId.toString()
                );
                if (attendeeProfile?.profileColor) {
                    eventColor = attendeeProfile.profileColor;
                }
            }

            return {
                id: e._id.toString(),
                title: e.title,
                summary: e.title,
                description: e.description,
                location: e.location,
                color: eventColor, // Use normalized color
                start: e.allDay
                    ? { date: e.startDate.toISOString().split('T')[0] }
                    : { dateTime: e.startDate.toISOString() },
                end: e.allDay
                    ? { date: e.endDate.toISOString().split('T')[0] }
                    : { dateTime: e.endDate.toISOString() },
                allDay: e.allDay,
                startDate: e.startDate,
                endDate: e.endDate,
                attendees: (e.attendees || []).map((id: any) => id.toString())
            };
        });

        res.status(200).json({
            status: 'success',
            data: {
                household: transformedHousehold,
                tasks,
                storeItems,
                events: transformedEvents
            }
        });

    } catch (error) {
        next(error);
    }
};

export const getFamilyData = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user || !req.householdId) {
            return next(new AppError('User not authenticated or household not found', 401));
        }

        const userId = req.user.id;
        const {householdId} = req;

        // Fetch data in parallel
        const [household, tasks, storeItems] = await Promise.all([
            Household.findById(householdId).populate('memberProfiles.familyMemberId'),
            Task.find({ householdId }).populate('assignedTo.memberId').populate('createdBy'),
            StoreItem.find({ householdId })
        ]);

        if (!household) {
            return next(new AppError('Household not found', 404));
        }

        // Transform member profiles to match mobile app expectations
        const memberProfiles = household.memberProfiles?.map((p: any) => ({
            id: p._id,
            _id: p._id,
            userId: p.familyMemberId?._id || p.familyMemberId,
            firstName: p.displayName || p.familyMemberId?.firstName || 'Unknown',
            lastName: p.familyMemberId?.lastName || '',
            profileColor: p.profileColor,
            pointsTotal: p.pointsTotal || 0,
            role: p.role,
            focusedTaskId: p.focusedTaskId,
            isLinkedChild: p.familyMemberId?.linkedHouseholds && p.familyMemberId.linkedHouseholds.length > 0
        })) || [];

        res.status(200).json({
            status: 'success',
            data: {
                memberProfiles,
                tasks,
                storeItems
            }
        });

    } catch (error) {
        next(error);
    }
};
