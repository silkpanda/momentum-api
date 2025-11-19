import { Response } from 'express';
import asyncHandler from 'express-async-handler';
import { Types } from 'mongoose';
import Quest from '../models/Quest';
import Household from '../models/Household';
import AppError from '../utils/AppError';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { io } from '../server';

// Helper to calculate initial nextReset
const calculateNextReset = (frequency: 'daily' | 'weekly' | 'monthly') => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(0, 0, 0, 0); // Reset to midnight

    if (frequency === 'daily') {
        next.setDate(next.getDate() + 1);
    } else if (frequency === 'weekly') {
        // Reset on next Monday? Or just 7 days from now?
        // Let's do 7 days from now for simplicity, or next Sunday.
        // Standard: Next day + 1 week
        next.setDate(next.getDate() + 1); // Tomorrow midnight
        // Actually, let's just do +1 day for daily.
        // For weekly, let's say "Next Monday".
        const day = next.getDay();
        const diff = next.getDate() - day + (day === 0 ? -6 : 1) + 7; // Next Monday
        next.setDate(diff);
    } else if (frequency === 'monthly') {
        next.setMonth(next.getMonth() + 1);
        next.setDate(1); // 1st of next month
    }
    return next;
};

/**
 * @desc    Create a new quest
 * @route   POST /api/v1/quests
 * @access  Private (Parent only)
 */
export const createQuest = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { title, description, pointsValue, questType, maxClaims, recurrence, dueDate } = req.body;
        const householdId = req.householdId;

        if (!title || !pointsValue) {
            throw new AppError('Title and points value are required.', 400);
        }

        // Prepare recurrence object if provided
        let recurrenceData = undefined;
        if (recurrence && recurrence !== 'none') {
            recurrenceData = {
                frequency: recurrence,
                resetTime: '00:00',
                lastReset: new Date(),
                nextReset: calculateNextReset(recurrence)
            };
        }

        const quest = await Quest.create({
            householdId,
            title,
            description,
            pointsValue,
            questType: questType || 'one-time',
            maxClaims,
            recurrence: recurrenceData,
            expiresAt: dueDate,
            createdBy: req.user?._id,
        });

        // Real-time update
        io.emit('quest_updated', { type: 'create', quest });

        res.status(201).json({
            status: 'success',
            data: { quest },
        });
    }
);

/**
 * @desc    Get all quests for the household
 * @route   GET /api/v1/quests
 * @access  Private
 */
export const getAllQuests = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const householdId = req.householdId;

        // Fetch all quests
        const quests = await Quest.find({ householdId }).sort({ createdAt: -1 });

        // LAZY RECURRENCE CHECK
        // Check if any recurring quests need resetting
        const updates = quests.map(async (quest) => {
            if (quest.recurrence && quest.recurrence.nextReset) {
                const updated = await quest.checkAndProcessRecurrence();
                if (updated) return updated;
            }
            return quest;
        });

        const processedQuests = await Promise.all(updates);

        res.status(200).json({
            status: 'success',
            results: processedQuests.length,
            data: { quests: processedQuests },
        });
    }
);

/**
 * @desc    Delete a quest
 * @route   DELETE /api/v1/quests/:id
 * @access  Private (Parent only)
 */
export const deleteQuest = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const householdId = req.householdId;

        const quest = await Quest.findOneAndDelete({ _id: id, householdId });

        if (!quest) {
            throw new AppError('Quest not found.', 404);
        }

        io.emit('quest_updated', { type: 'delete', questId: id });

        res.status(204).json({ status: 'success', data: null });
    }
);

/**
 * @desc    Claim a quest (Child/Member)
 * @route   POST /api/v1/quests/:id/claim
 * @access  Private
 */
export const claimQuest = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const { memberId } = req.body;
        const householdId = req.householdId;

        if (!memberId) {
            throw new AppError('Member ID is required to claim a quest.', 400);
        }

        const quest = await Quest.findOne({ _id: id, householdId });

        if (!quest) {
            throw new AppError('Quest not found.', 404);
        }

        try {
            await quest.claimQuest(memberId);
        } catch (err: any) {
            throw new AppError(err.message || 'Failed to claim quest.', 400);
        }

        io.emit('quest_updated', { type: 'update', quest });

        res.status(200).json({
            status: 'success',
            message: 'Quest claimed successfully.',
            data: { quest },
        });
    }
);

/**
 * @desc    Mark a quest as complete (waiting approval)
 * @route   POST /api/v1/quests/:id/complete
 * @access  Private
 */
export const completeQuest = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const { memberId } = req.body;
        const householdId = req.householdId;

        if (!memberId) {
            throw new AppError('Member ID is required to complete a quest.', 400);
        }

        const quest = await Quest.findOne({ _id: id, householdId });

        if (!quest) {
            throw new AppError('Quest not found.', 404);
        }

        try {
            await quest.completeQuest(memberId);
        } catch (err: any) {
            throw new AppError(err.message || 'Failed to complete quest.', 400);
        }

        io.emit('quest_updated', { type: 'update', quest });

        res.status(200).json({
            status: 'success',
            message: 'Quest marked as completed. Waiting for approval.',
            data: { quest },
        });
    }
);

/**
 * @desc    Approve a quest and award points
 * @route   POST /api/v1/quests/:id/approve
 * @access  Private (Parent only)
 */
export const approveQuest = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const { memberId } = req.body;
        const householdId = req.householdId;

        const quest = await Quest.findOne({ _id: id, householdId });
        if (!quest) throw new AppError('Quest not found.', 404);

        const household = await Household.findById(householdId);
        if (!household) throw new AppError('Household not found.', 404);

        const memberProfile = household.memberProfiles.find((p) =>
            p._id?.equals(memberId)
        );
        if (!memberProfile) throw new AppError('Member profile not found.', 404);

        try {
            await quest.approveQuest(memberId);
        } catch (err: any) {
            throw new AppError(err.message || 'Failed to approve quest.', 400);
        }

        memberProfile.pointsTotal = (memberProfile.pointsTotal || 0) + quest.pointsValue;
        await household.save();

        io.emit('quest_updated', { type: 'update', quest });

        io.emit('member_points_updated', {
            memberId,
            newTotal: memberProfile.pointsTotal
        });

        res.status(200).json({
            status: 'success',
            message: 'Quest approved and points awarded.',
            data: {
                quest,
                memberPoints: memberProfile.pointsTotal
            },
        });
    }
);