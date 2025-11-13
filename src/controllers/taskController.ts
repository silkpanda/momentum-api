// silkpanda/momentum-api/momentum-api-234e21f44dd55f086a321bc9901934f98b747c7a/src/controllers/taskController.ts
import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import Task from '../models/Task';
import { AuthenticatedRequest } from '../middleware/authMiddleware'; 
import AppError from '../utils/AppError'; 
import { Types } from 'mongoose';

/**
 * @desc    Get all tasks for the user's household
 * @route   GET /api/tasks
 * @access  Private
 */
export const getAllTasks = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const householdId = req.householdId; 

    if (!householdId) {
      throw new AppError('Household context not found in session token.', 401);
    }
    
    const tasks = await Task.find({ householdId });

    // --- MOBILE APP FIX (KEPT) ---
    res.status(200).json({
      status: 'success',
      results: tasks.length,
      data: tasks, // <-- This is the fix for the mobile app
    });
  },
);

/**
 * @desc    Create a new task
 * @route   POST /api/tasks
 * @access  Private (Parent only)
 */
export const createTask = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const {
      title,
      description,
      assignedTo,
      points,
      schedule,
    } = req.body;
    
    const householdId = req.householdId as Types.ObjectId; 

    if (!householdId) {
      throw new AppError('Household context not found in session token.', 401);
    }

    if (!title || !assignedTo || !points) {
      throw new AppError(
        'Missing required fields: title, assignedTo, and points are required.',
        400,
      );
    }
    
    const task = await Task.create({
      householdId,
      title,
      description,
      assignedTo,
      points,
      status: 'Pending',
      schedule, 
      createdBy: req.user?._id as Types.ObjectId,
    });

    // --- MOBILE APP FIX (KEPT) ---
    res.status(201).json({
      status: 'success',
      data: task, // <-- This is the fix for the mobile app
    });
  },
);

/**
 * @desc    Get a single task by ID
 * @route   GET /api/tasks/:id
 * @access  Private
 */
//
// FIX: Reverted name back to 'getTask' as you requested
//
export const getTask = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const task = await Task.findById(req.params.id);

    if (!task) {
      throw new AppError('No task found with that ID', 404);
    }
    
    // --- MOBILE APP FIX (KEPT) ---
    res.status(200).json({
      status: 'success',
      data: task, // <-- This is the fix for the mobile app
    });
  },
);

/**
 * @desc    Update a task (e.g., details, assignment)
 * @route   PATCH /api/tasks/:id
 * @access  Private (Parent only)
 */
export const updateTask = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { status, completedBy, approvedBy, ...updateData } = req.body;

    const task = await Task.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!task) {
      throw new AppError('No task found with that ID', 404);
    }
    
    // --- MOBILE APP FIX (KEPT) ---
    res.status(200).json({
      status: 'success',
      data: task, // <-- This is the fix for the mobile app
    });
  },
);

/**
 * @desc    Delete a task
 * @route   DELETE /api/tasks/:id
 * @access  Private (Parent only)
 */
export const deleteTask = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const task = await Task.findByIdAndDelete(req.params.id);

    if (!task) {
      throw new AppError('No task found with that ID', 404);
    }
    
    res.status(204).json({
      status: 'success',
      data: null,
    });
  },
);

// --- TASK WORKFLOW METHODS ---

/**
 * @desc    Mark a task as completed by the assignee
 * @route   PATCH /api/tasks/:id/complete
 * @access  Private (Assigned user only)
 */
export const completeTask = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const task = await Task.findById(req.params.id);

    if (!task) {
      throw new AppError('No task found with that ID', 404);
    }
    
    if (task.status !== 'Pending') {
        throw new AppError('Task is not pending and cannot be completed.', 400);
    }

    task.status = 'Completed';
    task.completedBy = req.user?._id as Types.ObjectId;
    task.completedAt = new Date();
    await task.save();

    res.status(200).json({
      status: 'success',
      data: task,
    });
  },
);

/**
 * @desc    Approve a completed task
 * @route   PATCH /api/tasks/:id/approve
 * @access  Private (Parent only)
 */
export const approveTask = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const task = await Task.findById(req.params.id);

    if (!task) {
      throw new AppError('No task found with that ID', 404);
    }

    if (task.status !== 'Completed') {
      throw new AppError('Task is not completed and cannot be approved.', 400);
    }

    task.status = 'Approved';
    task.approvedBy = req.user?._id as Types.ObjectId;
    task.approvedAt = new Date();
    await task.save();
    
    res.status(200).json({
      status: 'success',
      data: task,
    });
  },
);

/**
 * @desc    Re-open a completed task (reject)
 * @route   PATCH /api/tasks/:id/reopen
 * @access  Private (Parent only)
 */
export const reopenTask = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const task = await Task.findById(req.params.id);

    if (!task) {
      throw new AppError('No task found with that ID', 404);
    }

    if (task.status !== 'Completed') {
      throw new AppError('Only completed tasks can be reopened.', 400);
    }

    task.status = 'Pending';
    task.completedBy = undefined;
    task.completedAt = undefined;
    await task.save();

    res.status(200).json({
      status: 'success',
      data: task,
    });
  },
);