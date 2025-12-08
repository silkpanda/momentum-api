// src/controllers/taskController.ts
import { Response } from 'express';
import asyncHandler from 'express-async-handler';
import mongoose, { Types } from 'mongoose';
import Task from '../models/Task';
import Household from '../models/Household';
import HouseholdLink from '../models/HouseholdLink';
import AppError from '../utils/AppError';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
// import { io } from '../server'; // Import Socket.io instance - REMOVED to avoid circular dependency
import { updateMemberStreak, applyMultiplier } from '../utils/streakCalculator';

/**
 * @desc    Create a new task
 * @route   POST /api/tasks
 * @access  Private (Parent only)
 */
export const createTask = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { title, description, pointsValue, assignedTo, dueDate } = req.body;
    const {householdId} = req; // From JWT

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
    const io = req.app.get('io');
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
    const {householdId} = req; // From JWT

    // 1. Fetch local tasks
    let tasks = await Task.find({ householdId })
      .populate('assignedTo', 'displayName profileColor') // Populate member details
      .sort({ createdAt: -1 });

    // 2. Check for shared tasks from linked households
    try {
      const activeLinks = await HouseholdLink.find({
        $or: [{ household1: householdId }, { household2: householdId }],
        status: 'active',
        'sharingSettings.tasks': 'shared'
      });

      for (const link of activeLinks) {
        const otherHouseholdId = link.household1.toString() === householdId?.toString()
          ? link.household2
          : link.household1;

        const childFamilyMemberId = link.childId;

        // Find the member profile in the OTHER household for this child
        const otherHousehold = await Household.findById(otherHouseholdId);
        if (otherHousehold) {
          const otherMemberProfile = otherHousehold.memberProfiles.find(p =>
            p.familyMemberId.toString() === childFamilyMemberId.toString()
          );

          if (otherMemberProfile) {
            // Fetch tasks from the other household assigned to this child
            const otherTasks = await Task.find({
              householdId: otherHouseholdId,
              assignedTo: otherMemberProfile._id
            })
              .populate('assignedTo', 'displayName profileColor')
              .sort({ createdAt: -1 });

            // Add to the tasks list
            tasks = [...tasks, ...otherTasks];
          }
        }
      }
    } catch (err) {
      console.error('Error fetching shared tasks:', err);
      // Don't fail the request if sharing fails, just return local tasks
    }

    // Re-sort tasks by creation date
    tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
    const {householdId} = req;

    const task = await Task.findOne({ _id: taskId, householdId })
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
    const {householdId} = req;

    // Parents can update these fields
    const { title, description, pointsValue, assignedTo, dueDate, status } = req.body;

    const task = await Task.findOneAndUpdate(
      { _id: taskId, householdId },
      { title, description, pointsValue, assignedTo, dueDate, status },
      { new: true, runValidators: true },
    );

    if (!task) {
      throw new AppError('No task found with that ID in this household.', 404);
    }

    // Emit real-time update
    const io = req.app.get('io');
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
    const {householdId} = req;

    const task = await Task.findOneAndDelete({
      _id: taskId,
      householdId,
    });

    if (!task) {
      throw new AppError('No task found with that ID in this household.', 404);
    }

    // Emit real-time update
    const io = req.app.get('io');
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
    const {householdId} = req;
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
    const task = await Task.findOne({ _id: taskId, householdId });
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

      // --- SYNC POINTS TO LINKED HOUSEHOLDS ---
      try {
        const childFamilyMemberId = memberProfile.familyMemberId;
        const activeLinks = await HouseholdLink.find({
          childId: childFamilyMemberId,
          $or: [{ household1: householdId }, { household2: householdId }],
          status: 'active'
        });

        for (const link of activeLinks) {
          // Check if points are shared
          if (link.sharingSettings && link.sharingSettings.points === 'shared') {
            const otherHouseholdId = link.household1.toString() === householdId?.toString()
              ? link.household2
              : link.household1;

            const otherHousehold = await Household.findById(otherHouseholdId);
            if (otherHousehold) {
              const otherMemberProfile = otherHousehold.memberProfiles.find(p =>
                p.familyMemberId.toString() === childFamilyMemberId.toString()
              );

              if (otherMemberProfile) {
                otherMemberProfile.pointsTotal = (otherMemberProfile.pointsTotal || 0) + task.pointsValue;
                await otherHousehold.save();

                // Emit update to other household
                const io = req.app.get('io');
                if (io) {
                  io.to(otherHouseholdId.toString()).emit('member_updated', {
                    memberId: otherMemberProfile._id,
                    pointsTotal: otherMemberProfile.pointsTotal
                  });
                }
              }
            }
          }
        }
      } catch (syncError) {
        console.error('Error syncing points to linked households:', syncError);
      }

      task.status = 'Approved';
      task.completedBy = memberProfile._id as Types.ObjectId;
      await task.save();

      // Emit real-time update with member points
      const io = req.app.get('io');
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
      const io = req.app.get('io');
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
    const {householdId} = req;

    // 1. Find the task
    const task = await Task.findOne({
      _id: taskId,
      householdId,
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
      householdId,
      assignedTo: memberProfile._id,
      status: { $in: ['Pending', 'PendingApproval'] }
    });

    // After approving this task, check if any other tasks remain pending
    const remainingPendingTasks = allMemberTasks.filter((t: any) =>
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

    // --- SYNC POINTS TO LINKED HOUSEHOLDS ---
    try {
      const childFamilyMemberId = memberProfile.familyMemberId;
      const activeLinks = await HouseholdLink.find({
        childId: childFamilyMemberId,
        $or: [{ household1: householdId }, { household2: householdId }],
        status: 'active'
      });

      for (const link of activeLinks) {
        // Check if points are shared
        if (link.sharingSettings && link.sharingSettings.points === 'shared') {
          const otherHouseholdId = link.household1.toString() === householdId?.toString()
            ? link.household2
            : link.household1;

          const otherHousehold = await Household.findById(otherHouseholdId);
          if (otherHousehold) {
            const otherMemberProfile = otherHousehold.memberProfiles.find(p =>
              p.familyMemberId.toString() === childFamilyMemberId.toString()
            );

            if (otherMemberProfile) {
              otherMemberProfile.pointsTotal = (otherMemberProfile.pointsTotal || 0) + pointsToAward;
              await otherHousehold.save();

              // Emit update to other household
              const io = req.app.get('io');
              if (io) {
                io.to(otherHouseholdId.toString()).emit('member_updated', {
                  memberId: otherMemberProfile._id,
                  pointsTotal: otherMemberProfile.pointsTotal
                });
              }
            }
          }
        }
      }
    } catch (syncError) {
      console.error('Error syncing points to linked households:', syncError);
    }

    // Update task status
    task.status = 'Approved';
    await task.save();

    // Emit real-time update with member points and streak data
    const io = req.app.get('io');
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