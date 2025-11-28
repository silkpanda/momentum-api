import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { io } from '../server';
import AppError from '../utils/AppError';
import Household from '../models/Household';

/**
 * @desc    Send a notification to parents (e.g. "Remind Parent")
 * @route   POST /api/notifications/remind
 * @access  Private
 */
export const sendParentReminder = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const householdId = req.householdId;
    const userId = req.user?._id;
    const user = req.user;

    if (!householdId) {
        throw new AppError('Household context required', 400);
    }

    // Get household to find parents
    const household = await Household.findById(householdId);
    if (!household) {
        throw new AppError('Household not found', 404);
    }

    const parents = household.memberProfiles.filter(m => m.role === 'Parent');

    // In a real app, we would send Push Notifications here using Expo or FCM.
    // For now, we will use WebSockets to broadcast to the household.
    // The frontend will listen for 'notification' events.

    const notificationData = {
        id: new Date().getTime().toString(),
        type: 'reminder',
        title: 'Help Needed!',
        message: `${user?.firstName || 'A child'} needs your help!`,
        fromMemberId: userId,
        timestamp: new Date().toISOString()
    };

    // Emit to the household room
    io.to(householdId.toString()).emit('notification', notificationData);

    res.status(200).json({
        status: 'success',
        message: 'Reminder sent to parents',
        data: notificationData
    });
});
