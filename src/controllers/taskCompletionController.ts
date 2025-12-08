// src/controllers/taskCompletionController.ts
import { Response } from 'express';
import asyncHandler from 'express-async-handler';
import { Types } from 'mongoose';
import Task from '../models/Task';
import Household from '../models/Household';
import AppError from '../utils/AppError';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { emitTaskEvent } from '../utils/websocketHelper';
import { awardPointsToMember } from '../services/pointsService';

/**
 * @desc    Mark a task as complete
 * @route   POST /api/tasks/:id/complete
 * @access  Private
 */
export const completeTask = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const taskId = req.params.id;
        const { householdId } = req;
        const loggedInUserId = req.user?._id as Types.ObjectId;
        const { memberId } = req.body; // Optional memberId (for kiosk mode)

        if (!householdId) throw new AppError('Authentication error', 401);

        // 1. Resolve which member is completing the task
        const household = await Household.findById(householdId);
        if (!household) throw new AppError('Household not found.', 404);

        let memberProfile;
        if (memberId) {
            // Explicit member (e.g. Kiosk)
            memberProfile = household.memberProfiles.find((p) =>
                p._id?.equals(memberId),
            );
        } else {
            // Implicit member (User login)
            memberProfile = household.memberProfiles.find((p) =>
                p.familyMemberId.equals(loggedInUserId),
            );
        }

        if (!memberProfile) throw new AppError('Member profile not found.', 404);

        // 2. Find Task and verify assignment
        const task = await Task.findOne({ _id: taskId, householdId });
        if (!task) throw new AppError('Task not found.', 404);

        const isAssigned = task.assignedTo.some(
            (id) => id.toString() === memberProfile!._id!.toString(),
        );
        if (!isAssigned)
            throw new AppError('Member not assigned to this task.', 403);

        const isParent = memberProfile.role === 'Parent';
        const io = req.app.get('io');

        if (isParent) {
            // Parents auto-approve their own tasks
            const result = await awardPointsToMember(
                io,
                householdId,
                memberProfile._id!,
                task.pointsValue,
                false, // Don't check streak for simple parent completion
            );

            task.status = 'Approved';
            task.completedBy = memberProfile._id as Types.ObjectId;
            await task.save();

            emitTaskEvent(io, householdId, 'task_completed', {
                type: 'update',
                task,
                memberUpdate: {
                    memberId: memberProfile._id,
                    pointsTotal: result.updatedProfile.pointsTotal,
                },
            });

            res.status(200).json({
                status: 'success',
                message: 'Task completed and points awarded.',
                data: { task, updatedProfile: result.updatedProfile },
            });
        } else {
            // Children require approval
            task.status = 'PendingApproval';
            task.completedBy = memberProfile._id as Types.ObjectId;
            await task.save();

            emitTaskEvent(io, householdId, 'task_completed', {
                type: 'update',
                task,
            });

            res.status(200).json({
                status: 'success',
                message: 'Task marked for approval.',
                data: { task },
            });
        }
    },
);

/**
 * @desc    Approve a completed task
 * @route   POST /api/tasks/:id/approve
 * @access  Private (Parent only)
 */
export const approveTask = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const taskId = req.params.id;
        const { householdId } = req;
        if (!householdId) throw new AppError('Authentication error', 401);

        // 1. Find Task
        const task = await Task.findOne({
            _id: taskId,
            householdId,
            status: 'PendingApproval',
        });

        if (!task || !task.completedBy) {
            throw new AppError('Task not found or not pending approval.', 404);
        }

        // 2. Check for Streak Eligibility
        // (If all OTHER tasks assigned to this user are complete, we update streak)
        const allMemberTasks = await Task.find({
            householdId,
            assignedTo: task.completedBy,
            status: { $in: ['Pending', 'PendingApproval'] },
        });

        const remainingPending = allMemberTasks.filter(
            (t: any) => !t._id.equals(taskId),
        );
        const isStreakEligible = remainingPending.length === 0;

        // 3. Award Points & Update Streak via Service
        const io = req.app.get('io');
        const result = await awardPointsToMember(
            io,
            householdId,
            task.completedBy,
            task.pointsValue,
            isStreakEligible,
        );

        // 4. Update Task
        task.status = 'Approved';
        await task.save();

        // 5. Emit
        emitTaskEvent(io, householdId, 'task_approved', {
            type: 'update',
            task,
            memberUpdate: {
                memberId: result.updatedProfile._id,
                pointsTotal: result.updatedProfile.pointsTotal,
                currentStreak: result.updatedProfile.currentStreak,
                longestStreak: result.updatedProfile.longestStreak,
                streakMultiplier: result.updatedProfile.streakMultiplier,
                lastCompletionDate: result.updatedProfile.lastCompletionDate,
            },
        });

        res.status(200).json({
            status: 'success',
            message: `Task approved and ${result.pointsAwarded} points awarded.`,
            data: {
                task,
                updatedProfile: result.updatedProfile,
                pointsAwarded: result.pointsAwarded,
                streakUpdated: result.streakUpdated,
                multiplier: result.multiplier,
            },
        });
    },
);

/**
 * @desc    Reject a completed task
 * @route   POST /api/tasks/:id/reject
 * @access  Private (Parent only)
 */
export const rejectTask = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const taskId = req.params.id;
        const { householdId } = req;
        if (!householdId) throw new AppError('Authentication error', 401);

        const task = await Task.findOne({
            _id: taskId,
            householdId,
            status: 'PendingApproval',
        });

        if (!task) {
            throw new AppError('Task not found or not pending approval.', 404);
        }

        task.status = 'Pending';
        task.completedBy = undefined;
        await task.save();

        const io = req.app.get('io');
        emitTaskEvent(io, householdId, 'task_rejected', {
            type: 'reject',
            task,
        });

        res.status(200).json({
            status: 'success',
            data: { task },
        });
    },
);
