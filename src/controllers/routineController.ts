import { Response } from 'express';
import asyncHandler from 'express-async-handler';
import Routine from '../models/Routine';
import Household from '../models/Household';
import AppError from '../utils/AppError';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { io } from '../server';

/**
 * @desc    Create a new routine
 * @route   POST /api/v1/routines
 * @access  Private (Parent)
 */
export const createRoutine = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { title, description, assignedTo, steps, schedule, pointsReward, icon, color } = req.body;
        const householdId = req.householdId;

        if (!title || !assignedTo || !steps || steps.length === 0) {
            throw new AppError('Title, assigned member, and at least one step are required.', 400);
        }

        const routine = await Routine.create({
            householdId,
            assignedTo,
            title,
            description,
            steps,
            schedule,
            pointsReward: pointsReward || 10,
            icon,
            color,
            createdBy: req.user?._id
        });

        io.emit('routine_updated', { type: 'create', routine });

        res.status(201).json({
            status: 'success',
            data: { routine }
        });
    }
);

/**
 * @desc    Get all routines for household
 * @route   GET /api/v1/routines
 * @access  Private
 */
export const getAllRoutines = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const householdId = req.householdId;
        const routines = await Routine.find({ householdId }).sort({ createdAt: -1 });

        res.status(200).json({
            status: 'success',
            results: routines.length,
            data: { routines }
        });
    }
);

/**
 * @desc    Get routines for a specific member
 * @route   GET /api/v1/routines/member/:memberId
 * @access  Private
 */
export const getMemberRoutines = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { memberId } = req.params;
        const householdId = req.householdId;

        const routines = await Routine.find({ householdId, assignedTo: memberId, isActive: true });

        res.status(200).json({
            status: 'success',
            results: routines.length,
            data: { routines }
        });
    }
);

/**
 * @desc    Update a routine
 * @route   PUT /api/v1/routines/:id
 * @access  Private (Parent)
 */
export const updateRoutine = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const householdId = req.householdId;

        const routine = await Routine.findOneAndUpdate(
            { _id: id, householdId },
            req.body,
            { new: true, runValidators: true }
        );

        if (!routine) {
            throw new AppError('Routine not found', 404);
        }

        io.emit('routine_updated', { type: 'update', routine });

        res.status(200).json({
            status: 'success',
            data: { routine }
        });
    }
);

/**
 * @desc    Delete a routine
 * @route   DELETE /api/v1/routines/:id
 * @access  Private (Parent)
 */
export const deleteRoutine = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const householdId = req.householdId;

        const routine = await Routine.findOneAndDelete({ _id: id, householdId });

        if (!routine) {
            throw new AppError('Routine not found', 404);
        }

        io.emit('routine_updated', { type: 'delete', routineId: id });

        res.status(204).json({ status: 'success', data: null });
    }
);

/**
 * @desc    Complete a routine (Award points)
 * @route   POST /api/v1/routines/:id/complete
 * @access  Private
 */
export const completeRoutine = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const { memberId } = req.body;
        const householdId = req.householdId;

        const routine = await Routine.findOne({ _id: id, householdId });
        if (!routine) throw new AppError('Routine not found', 404);

        if (routine.assignedTo !== memberId) {
            throw new AppError('This routine is assigned to a different member', 403);
        }

        // Award points
        const household = await Household.findById(householdId);
        if (!household) throw new AppError('Household not found', 404);

        const memberProfile = household.memberProfiles.find(p => p._id?.equals(memberId));
        if (!memberProfile) throw new AppError('Member not found', 404);

        memberProfile.pointsTotal = (memberProfile.pointsTotal || 0) + routine.pointsReward;
        await household.save();

        // Emit events
        io.emit('member_points_updated', {
            memberId,
            newTotal: memberProfile.pointsTotal
        });

        // We might want to log this completion in a history collection later

        res.status(200).json({
            status: 'success',
            message: 'Routine completed!',
            data: {
                pointsAwarded: routine.pointsReward,
                newTotal: memberProfile.pointsTotal
            }
        });
    }
);
