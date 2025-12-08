// src/controllers/routineController.ts
import { Response } from 'express';
import asyncHandler from 'express-async-handler';
import Routine from '../models/Routine';
import AppError from '../utils/AppError';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
// import { io } from '../server'; // REMOVED to avoid circular dependency

/**
 * Helper: Check if routine needs daily reset
 */
const checkAndResetRoutine = async (routine: any): Promise<void> => {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    if (routine.lastResetDate !== today) {
        // Reset all items to incomplete
        routine.items.forEach((item: any) => {
            item.isCompleted = false;
            item.completedAt = undefined;
        });
        routine.lastResetDate = today;
        await routine.save();
    }
};

/**
 * @desc    Create a new routine
 * @route   POST /api/routines
 * @access  Private (Parent)
 */
export const createRoutine = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { title, memberId, timeOfDay, items } = req.body;
        const {householdId} = req;

        if (!title || !memberId || !timeOfDay) {
            throw new AppError('Title, member ID, and time of day are required.', 400);
        }

        // Ensure items have proper order
        const orderedItems = (items || []).map((item: any, index: number) => ({
            title: item.title,
            order: item.order !== undefined ? item.order : index,
            isCompleted: false,
            completedAt: undefined,
        }));

        const routine = await Routine.create({
            householdId,
            memberId,
            title,
            timeOfDay,
            items: orderedItems,
            createdBy: req.user?._id,
            lastResetDate: new Date().toISOString().split('T')[0],
        });

        const io = req.app.get('io');
        io.emit('routine_updated', { type: 'create', routine });

        res.status(201).json({
            status: 'success',
            data: { routine },
        });
    }
);

/**
 * @desc    Get all routines for household
 * @route   GET /api/routines
 * @access  Private
 */
export const getAllRoutines = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const {householdId} = req;
        const routines = await Routine.find({ householdId, isActive: true }).sort({ createdAt: -1 });

        // Check and reset routines if needed
        for (const routine of routines) {
            await checkAndResetRoutine(routine);
        }

        res.status(200).json({
            status: 'success',
            results: routines.length,
            data: { routines },
        });
    }
);

/**
 * @desc    Get routines for a specific member
 * @route   GET /api/routines/member/:memberId
 * @access  Private
 */
export const getMemberRoutines = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { memberId } = req.params;
        const {householdId} = req;

        const routines = await Routine.find({
            householdId,
            memberId,
            isActive: true
        }).sort({ timeOfDay: 1, createdAt: 1 });

        // Check and reset routines if needed
        for (const routine of routines) {
            await checkAndResetRoutine(routine);
        }

        res.status(200).json({
            status: 'success',
            results: routines.length,
            data: { routines },
        });
    }
);

/**
 * @desc    Get a single routine by ID
 * @route   GET /api/routines/:id
 * @access  Private
 */
export const getRoutineById = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const {householdId} = req;

        const routine = await Routine.findOne({ _id: id, householdId });

        if (!routine) {
            throw new AppError('Routine not found', 404);
        }

        // Check and reset if needed
        await checkAndResetRoutine(routine);

        res.status(200).json({
            status: 'success',
            data: { routine },
        });
    }
);

/**
 * @desc    Update a routine
 * @route   PUT /api/routines/:id
 * @access  Private (Parent)
 */
export const updateRoutine = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const {householdId} = req;
        const { title, timeOfDay, items, isActive } = req.body;

        const routine = await Routine.findOne({ _id: id, householdId });

        if (!routine) {
            throw new AppError('Routine not found', 404);
        }

        // Update fields
        if (title) routine.title = title;
        if (timeOfDay) routine.timeOfDay = timeOfDay;
        if (isActive !== undefined) routine.isActive = isActive;

        if (items) {
            routine.items = items.map((item: any, index: number) => ({
                _id: item._id,
                title: item.title,
                order: item.order !== undefined ? item.order : index,
                isCompleted: item.isCompleted || false,
                completedAt: item.completedAt || undefined,
            }));
        }

        await routine.save();

        const io = req.app.get('io');
        io.emit('routine_updated', { type: 'update', routine });

        res.status(200).json({
            status: 'success',
            data: { routine },
        });
    }
);

/**
 * @desc    Delete a routine
 * @route   DELETE /api/routines/:id
 * @access  Private (Parent)
 */
export const deleteRoutine = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const {householdId} = req;

        const routine = await Routine.findOneAndDelete({ _id: id, householdId });

        if (!routine) {
            throw new AppError('Routine not found', 404);
        }

        const io = req.app.get('io');
        io.emit('routine_updated', { type: 'delete', routineId: id });

        res.status(204).json({ status: 'success', data: null });
    }
);

/**
 * @desc    Toggle a routine item completion
 * @route   POST /api/routines/:id/items/:itemId/toggle
 * @access  Private
 */
export const toggleRoutineItem = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { id, itemId } = req.params;
        const {householdId} = req;

        const routine = await Routine.findOne({ _id: id, householdId });

        if (!routine) {
            throw new AppError('Routine not found', 404);
        }

        // Check and reset if needed
        await checkAndResetRoutine(routine);

        // Find the item
        const item = routine.items.find((i: any) => i._id?.toString() === itemId);

        if (!item) {
            throw new AppError('Routine item not found', 404);
        }

        // Toggle completion
        item.isCompleted = !item.isCompleted;
        item.completedAt = item.isCompleted ? new Date() : undefined;

        await routine.save();

        // Emit real-time update
        // Emit real-time update
        const io = req.app.get('io');
        io.emit('routine_item_toggled', {
            routineId: id,
            itemId,
            isCompleted: item.isCompleted,
            memberId: routine.memberId,
        });

        res.status(200).json({
            status: 'success',
            message: item.isCompleted ? 'Item completed!' : 'Item unchecked',
            data: {
                routine,
                item: {
                    _id: item._id,
                    title: item.title,
                    isCompleted: item.isCompleted,
                    completedAt: item.completedAt,
                },
            },
        });
    }
);

/**
 * @desc    Manually reset a routine (Admin only)
 * @route   POST /api/routines/:id/reset
 * @access  Private (Parent)
 */
export const resetRoutine = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const {householdId} = req;

        const routine = await Routine.findOne({ _id: id, householdId });

        if (!routine) {
            throw new AppError('Routine not found', 404);
        }

        // Reset all items
        routine.items.forEach((item: any) => {
            item.isCompleted = false;
            item.completedAt = undefined;
        });
        routine.lastResetDate = new Date().toISOString().split('T')[0];

        await routine.save();

        const io = req.app.get('io');
        io.emit('routine_updated', { type: 'reset', routine });

        res.status(200).json({
            status: 'success',
            message: 'Routine reset successfully',
            data: { routine },
        });
    }
);
