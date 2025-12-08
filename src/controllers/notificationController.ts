import { Request, Response, NextFunction } from 'express';
import asyncHandler from 'express-async-handler';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { io } from '../server';
import AppError from '../utils/AppError';
import Household from '../models/Household';
import Notification, { NotificationType } from '../models/Notification';
import FamilyMember from '../models/FamilyMember';

/**
 * @desc    Get all notifications for the current user
 * @route   GET /api/v1/notifications
 * @access  Private
 */
export const getNotifications = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?._id;

    const notifications = await Notification.find({ recipientId: userId })
        .sort({ createdAt: -1 })
        .limit(50); // Limit to last 50 notifications

    const unreadCount = await Notification.countDocuments({
        recipientId: userId,
        isRead: false
    });

    res.status(200).json({
        status: 'success',
        results: notifications.length,
        unreadCount,
        data: {
            notifications
        }
    });
});

/**
 * @desc    Mark a notification as read
 * @route   PATCH /api/v1/notifications/:id/read
 * @access  Private
 */
export const markAsRead = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user?._id;

    const notification = await Notification.findOne({ _id: id, recipientId: userId });

    if (!notification) {
        throw new AppError('Notification not found', 404);
    }

    notification.isRead = true;
    await notification.save();

    res.status(200).json({
        status: 'success',
        data: {
            notification
        }
    });
});

/**
 * @desc    Mark all notifications as read
 * @route   PATCH /api/v1/notifications/read-all
 * @access  Private
 */
export const markAllAsRead = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?._id;

    await Notification.updateMany(
        { recipientId: userId, isRead: false },
        { $set: { isRead: true } }
    );

    res.status(200).json({
        status: 'success',
        message: 'All notifications marked as read'
    });
});

/**
 * @desc    Send a notification to parents (e.g. "Remind Parent")
 * @route   POST /api/v1/notifications/remind
 * @access  Private
 */
export const sendParentReminder = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {householdId} = req;
    const userId = req.user?._id;
    const {user} = req;

    if (!householdId) {
        throw new AppError('Household context required', 400);
    }

    // Get household to find parents
    const household = await Household.findById(householdId);
    if (!household) {
        throw new AppError('Household not found', 404);
    }

    const parents = household.memberProfiles.filter(m => m.role === 'Parent');

    if (parents.length === 0) {
        throw new AppError('No parents found in household', 404);
    }

    // Create notifications for all parents
    const notifications = await Promise.all(parents.map(async (parent) => Notification.create({
            recipientId: parent.familyMemberId,
            householdId,
            type: NotificationType.REMINDER,
            title: 'Help Needed!',
            message: `${user?.firstName || 'A child'} needs your help!`,
            data: { fromMemberId: userId },
            isRead: false
        })));

    // Emit to the household room via Socket.IO
    io.to(householdId.toString()).emit('notification', {
        type: 'reminder',
        title: 'Help Needed!',
        message: `${user?.firstName || 'A child'} needs your help!`,
        fromMemberId: userId,
        recipients: parents.map(p => p.familyMemberId),
        timestamp: new Date().toISOString()
    });

    res.status(200).json({
        status: 'success',
        message: 'Reminder sent to parents',
        data: notifications
    });
});

/**
 * @desc    Save push token for the current user
 * @route   POST /api/v1/notifications/push-token
 * @access  Private
 */
export const savePushToken = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { token } = req.body;
    const userId = req.user!._id;

    if (!token) {
        return next(new AppError('Push token is required', 400));
    }

    await FamilyMember.findByIdAndUpdate(userId, {
        $addToSet: { pushTokens: token }
    });

    res.status(200).json({
        status: 'success',
        message: 'Push token saved'
    });
});
