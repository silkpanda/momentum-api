// src/controllers/taskController.ts
import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import Task from '../models/Task';
import Household from '../models/Household'; // <-- NEW IMPORT for awarding points
import AppError from '../utils/AppError';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { Types } from 'mongoose';

/**
 * @desc    Create a new task
 * @route   POST /api/tasks
 * @access  Private (Parent only)
 */
export const createTask = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { title, description, pointsValue, assignedTo, dueDate } = req.body;
    const householdId = req.householdId; // From JWT

    if (!title || !pointsValue || !assignedTo || assignedTo.length === 0) {
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

    const tasks = await Task.find({ householdId: householdId }).sort({
      createdAt: -1,
    });

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

    const task = await Task.findOne({ _id: taskId, householdId: householdId });

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
    const { title, description, pointsValue, assignedTo, dueDate, status } =
      req.body;

    const task = await Task.findOneAndUpdate(
      { _id: taskId, householdId: householdId },
      { title, description, pointsValue, assignedTo, dueDate, status },
      { new: true, runValidators: true },
    );

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

    res.status(204).json({
      status: 'success',
      data: null,
    });
    // src/controllers/taskController.ts
    import { Request, Response } from 'express';
    import asyncHandler from 'express-async-handler';
    import Task from '../models/Task';
    import Household from '../models/Household'; // <-- NEW IMPORT for awarding points
    import AppError from '../utils/AppError';
    import { AuthenticatedRequest } from '../middleware/authMiddleware';
    import { Types } from 'mongoose';

    /**
     * @desc    Create a new task
     * @route   POST /api/tasks
     * @access  Private (Parent only)
     */
    export const createTask = asyncHandler(
      async (req: AuthenticatedRequest, res: Response) => {
        const { title, description, pointsValue, assignedTo, dueDate } = req.body;
        const householdId = req.householdId; // From JWT

        if (!title || !pointsValue || !assignedTo || assignedTo.length === 0) {
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

        const tasks = await Task.find({ householdId: householdId }).sort({
          createdAt: -1,
        });

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

        const task = await Task.findOne({ _id: taskId, householdId: householdId });

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
        const { title, description, pointsValue, assignedTo, dueDate, status } =
          req.body;

        const task = await Task.findOneAndUpdate(
          { _id: taskId, householdId: householdId },
          { title, description, pointsValue, assignedTo, dueDate, status },
          { new: true, runValidators: true },
        );

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

        res.status(204).json({
          status: 'success',
          data: null,
        });
      },
    );

    // -----------------------------------------------------------------
    // --- NEW V4 TASK COMPLETION FLOW (STEP 3.3) ---
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
        const { memberId } = req.body; // <-- FIX: Accept memberId from body

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
          // Case B: Implicit (User completing their own task)
          memberProfile = household.memberProfiles.find((p) =>
            p.familyMemberId.equals(loggedInUserId),
          );
          if (!memberProfile) {
            throw new AppError('Your member profile was not found.', 404);
          }
        }

        // 3. Find the task
        const task = await Task.findOne({ _id: taskId, householdId: householdId });
        if (!task) {
          throw new AppError('Task not found.', 404);
        }

        // 4. Check if member is assigned to this task
        const isAssigned = task.assignedTo.some((assignedId) =>
          assignedId.equals(memberProfile!._id),
        );
        if (!isAssigned) {
          throw new AppError('This member is not assigned to this task.', 403);
        }

        // 5. Update the task status
        task.status = 'PendingApproval';
        task.completedBy = memberProfile!._id; // Track who completed it
        await task.save();

        res.status(200).json({
          status: 'success',
          message: 'Task marked for approval.',
          data: {
            task,
          },
        });
      },
    );

    /**
     * @desc    Approve a completed task (Parent only)
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
        // --- FIX #1 ---
        // Use optional chaining 'p._id?.' because _id is optional
        const memberProfile = household.memberProfiles.find((p) =>
          p._id?.equals(task.completedBy!),
        );
        // --- END OF FIX #1 ---

        if (!memberProfile) {
          throw new AppError(
            'Member profile who completed task not found.',
            404,
          );
        }

        // 4. Atomically update the member's points and save the task status

        // --- FIX #2 ---
        // Initialize pointsTotal with 0 if it's undefined
        // before adding the new task points.
        memberProfile.pointsTotal =
          (memberProfile.pointsTotal || 0) + task.pointsValue;
        // --- END OF FIX #2 ---
        await household.save();

        // Update task
        task.status = 'Approved';
        await task.save();

        res.status(200).json({
          status: 'success',
          message: 'Task approved and points awarded.',
          data: {
            task,
            updatedProfile: memberProfile,
          },
        });
      },
    );