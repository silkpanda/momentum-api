// src/controllers/taskController.ts
import { Response } from 'express';
import asyncHandler from 'express-async-handler';
import mongoose, { Types } from 'mongoose';
import Task from '../models/Task';
import Household from '../models/Household';
import AppError from '../utils/AppError';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { io } from '../server'; // Import Socket.io instance
import { updateMemberStreak, applyMultiplier } from '../utils/streakCalculator';

/**
 * @desc    Create a new task
 * @route   POST /api/tasks
 * @access  Private (Parent only)
 */
export const createTask = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { title, description, pointsValue, assignedTo, dueDate } = req.body;
    const householdId = req.householdId; // From JWT

    if (!title || pointsValue === undefined || !assignedTo || assignedTo.length === 0) {
      throw new AppError(
        'Missing required fields: title, pointsValue, and at least one assignedTo ID are required.',
        400,
      );
    }

    const task = await Task.create({
      householdId,
      title,
      description,
      pointsValue,
      assignedTo, // This should be an array of memberProfile _ids
      dueDate,
      status: 'Pending', // Default status
    });

    // Emit real-time update
    io.emit('task_updated', { type: 'create', task });

    res.status(201).json({
      status: 'success',
      data: {
        task,
      },
    });
  },
);

/**
 * @desc    Get all tasks for the user's household
 * @route   GET /api/tasks
 * @access  Private
 */
export const getAllTasks = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const householdId = req.householdId; // From JWT

    const tasks = await Task.find({ householdId: householdId })
      .populate('assignedTo', 'displayName profileColor') // Populate member details
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      results: tasks.length,
      data: {
        tasks,
      },
    });
  },
);

/**
 * @desc    Get a single task by its ID
 * @route   GET /api/tasks/:id
 * @access  Private
 */
export const getTaskById = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const taskId = req.params.id;
    const householdId = req.householdId;

    const task = await Task.findOne({ _id: taskId, householdId: householdId })
      .populate('assignedTo', 'displayName profileColor');

    if (!task) {
      throw new AppError('No task found with that ID in this household.', 404);
    }

    res.status(200).json({
      status: 'success',
      data: {
        task,
      },
    });
  },
);

// ALIAS: Export getTask as an alias for getTaskById to support legacy routes
export const getTask = getTaskById;

/**
 * @desc    Update a task (Parent only)
 * @route   PATCH /api/tasks/:id
 * @access  Private (Parent only)
 */
export const updateTask = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const taskId = req.params.id;
    const householdId = req.householdId;

    // Parents can update these fields
    const { title, description, pointsValue, assignedTo, dueDate, status } = req.body;

    const task = await Task.findOneAndUpdate(
      { _id: taskId, householdId: householdId },
      { title, description, pointsValue, assignedTo, dueDate, status },
      { new: true, runValidators: true },
    );

    if (!task) {
      throw new AppError('No task found with that ID in this household.', 404);
    }

    // Emit real-time update
    io.emit('task_updated', { type: 'update', task });

    res.status(200).json({
      status: 'success',
      data: {
        task,
      },
    });
  },
);

/**
 * @desc    Delete a task (Parent only)
 * @route   DELETE /api/tasks/:id
 * @access  Private (Parent only)
 */
export const deleteTask = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const taskId = req.params.id;
    const householdId = req.householdId;

    const task = await Task.findOneAndDelete({
      _id: taskId,
      householdId: householdId,
    });

    if (!task) {
      throw new AppError('No task found with that ID in this household.', 404);
    }

    // Emit real-time update
    io.emit('task_updated', { type: 'delete', taskId });

    res.status(204).json({
      status: 'success',
      data: null,
    });
  },
);

// -----------------------------------------------------------------
// --- V4 TASK COMPLETION & APPROVAL FLOW (STEP 3.3) ---
// -----------------------------------------------------------------

/**
 * @desc    Mark a task as complete (for any member)
 * @route   POST /api/tasks/:id/complete
 * @access  Private
 */
export const completeTask = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const taskId = req.params.id;
    const householdId = req.householdId;
    const loggedInUserId = req.user?._id as Types.ObjectId;
    const { memberId } = req.body;

    // 1. Find the household
    const household = await Household.findById(householdId);
    if (!household) {
      throw new AppError('Household not found.', 404);
    }

    // 2. Determine which member is completing the task
    let memberProfile;

    if (memberId) {
      // Case A: Kiosk Mode / Explicit Member ID
      // Verify that this memberId exists in the household
      memberProfile = household.memberProfiles.find((p) =>
        p._id?.equals(memberId),
      );
      if (!memberProfile) {
        throw new AppError('Member not found in this household.', 404);
      }
    } else {
      // Case B: Implicit (User completing their own task - e.g., Parent)
      memberProfile = household.memberProfiles.find((p) =>
        p.familyMemberId.equals(loggedInUserId),
      );
      if (!memberProfile) {
        throw new AppError('Your member profile was not found in this household.', 404);
      }
    }

    // 3. Find the task
    const task = await Task.findOne({ _id: taskId, householdId: householdId });
    if (!task) {
      throw new AppError('Task not found.', 404);
    }

    // 4. Check if member is assigned to this task
    // We use .toString() for reliable comparison of ObjectIds
    const isAssigned = task.assignedTo.some((assignedId) =>
      assignedId.toString() === memberProfile!._id!.toString()
    );

    if (!isAssigned) {
      throw new AppError('This member is not assigned to this task.', 403);
    }

    // 5. Check if the completing member is a Parent
    const isParent = memberProfile.role === 'Parent';

    if (isParent) {
      // Parents auto-approve their own tasks
      // Award points immediately and mark as Approved
      memberProfile.pointsTotal = (memberProfile.pointsTotal || 0) + task.pointsValue;
      await household.save();

      task.status = 'Approved';
      task.completedBy = memberProfile._id as Types.ObjectId;
      await task.save();

      // Emit real-time update with member points
      io.emit('task_updated', {
        type: 'update',
        task,
        memberUpdate: {
          memberId: memberProfile._id,
          pointsTotal: memberProfile.pointsTotal
        }
      });

      res.status(200).json({
        status: 'success',
        message: 'Task completed and points awarded.',
        data: {
          task,
          updatedProfile: memberProfile,
        },
      });
    } else {
      // Children require approval
      task.status = 'PendingApproval';
      task.completedBy = memberProfile!._id as Types.ObjectId;
      await task.save();

      // Emit real-time update
      io.emit('task_updated', { type: 'update', task });

      res.status(200).json({
        status: 'success',
        message: 'Task marked for approval.',
        data: {
          task,
        },
      });
    }
  },
);

/**
 * @desc    Approve a completed task (Parent only) - WITH STREAK CALCULATION
 * @route   POST /api/tasks/:id/approve
 * @access  Private (Parent only)
 */
export const approveTask = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const taskId = req.params.id;
    const householdId = req.householdId;

    // 1. Find the task
    const task = await Task.findOne({
      _id: taskId,
      householdId: householdId,
      status: 'PendingApproval', // Can only approve tasks that are pending
    });

    if (!task) {
      throw new AppError(
        'Task not found or is not pending approval.',
        404,
      );
    }
    if (!task.completedBy) {
      throw new AppError(
        'Task cannot be approved: completedBy field is missing.',
        400,
      );
    }

    // 2. Find the household to update points
    const household = await Household.findById(householdId);
    if (!household) {
      throw new AppError('Household not found.', 404);
    }

    // 3. Find the member profile who completed the task
    const memberProfile = household.memberProfiles.find((p) =>
      p._id?.equals(task.completedBy!),
    );

    if (!memberProfile) {
      throw new AppError(
        'Member profile who completed task not found.',
        404,
      );
    }

    // 4. Check if all assigned tasks for this member are now complete (for streak calculation)
    const allMemberTasks = await Task.find({
      householdId: householdId,
      assignedTo: memberProfile._id,
      status: { $in: ['Pending', 'PendingApproval'] }
    });

    // After approving this task, check if any other tasks remain pending
    const remainingPendingTasks = allMemberTasks.filter(t =>
      !t._id.equals(taskId) // Exclude the task being approved
    );

    const allTasksComplete = remainingPendingTasks.length === 0;

    // 5. Calculate streak if all tasks are complete
    if (allTasksComplete) {
      const streakUpdate = updateMemberStreak(
        memberProfile.currentStreak || 0,
        memberProfile.longestStreak || 0,
        memberProfile.lastCompletionDate,
        true
      );

      // Update member's streak data
      memberProfile.currentStreak = streakUpdate.currentStreak;
      memberProfile.longestStreak = streakUpdate.longestStreak;
      memberProfile.lastCompletionDate = streakUpdate.lastCompletionDate;
      memberProfile.streakMultiplier = streakUpdate.streakMultiplier;
    }

    // 6. Apply multiplier to points (only for assigned tasks, per spec)
    const currentMultiplier = memberProfile.streakMultiplier || 1.0;
    const pointsToAward = applyMultiplier(task.pointsValue, currentMultiplier);

    // 7. Award points
    memberProfile.pointsTotal = (memberProfile.pointsTotal || 0) + pointsToAward;
    await household.save();

    // Update task status
    task.status = 'Approved';
    await task.save();

    // Emit real-time update with member points and streak data
    io.emit('task_updated', {
      type: 'update',
      task,
      memberUpdate: {
        memberId: memberProfile._id,
        pointsTotal: memberProfile.pointsTotal,
        currentStreak: memberProfile.currentStreak,
        longestStreak: memberProfile.longestStreak,
        streakMultiplier: memberProfile.streakMultiplier,
        lastCompletionDate: memberProfile.lastCompletionDate,
      }
    });

    res.status(200).json({
      status: 'success',
      message: `Task approved and ${pointsToAward} points awarded${currentMultiplier > 1.0 ? ` (${currentMultiplier}x multiplier!)` : ''}.`,
      data: {
        task,
        updatedProfile: memberProfile,
        pointsAwarded: pointsToAward,
        basePoints: task.pointsValue,
        multiplier: currentMultiplier,
        streakUpdated: allTasksComplete,
      },
    });
  },
);