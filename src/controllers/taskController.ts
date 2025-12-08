// src/controllers/taskController.ts
import { Response } from 'express';
import asyncHandler from 'express-async-handler';
import Task from '../models/Task';
import AppError from '../utils/AppError';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { emitTaskEvent } from '../utils/websocketHelper';
import { getSharedTasks } from '../services/householdSharingService';

/**
 * @desc    Create a new task
 * @route   POST /api/tasks
 * @access  Private (Parent only)
 */
export const createTask = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { title, description, pointsValue, assignedTo, dueDate } = req.body;
    const { householdId } = req;

    if (!title || pointsValue === undefined || !assignedTo || assignedTo.length === 0) {
      throw new AppError(
        'Missing required fields: title, pointsValue, and at least one assignedTo ID are required.',
        400,
      );
    }

    if (!householdId) throw new AppError('Authentication error', 401);

    const task = await Task.create({
      householdId,
      title,
      description,
      pointsValue,
      assignedTo,
      dueDate,
      status: 'Pending',
    });

    const io = req.app.get('io');
    emitTaskEvent(io, householdId, 'task_created', {
      type: 'create',
      task
    });

    res.status(201).json({
      status: 'success',
      data: { task },
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
    const { householdId } = req;
    if (!householdId) throw new AppError('Authentication error', 401);

    // 1. Fetch local tasks
    let tasks = await Task.find({ householdId })
      .populate('assignedTo', 'displayName profileColor')
      .sort({ createdAt: -1 });

    // 2. Fetch shared tasks from linked households
    const sharedTasks = await getSharedTasks(householdId);

    // 3. Combine and sort
    if (sharedTasks.length > 0) {
      tasks = [...tasks, ...sharedTasks];
      tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    res.status(200).json({
      status: 'success',
      results: tasks.length,
      data: { tasks },
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
    const { householdId } = req;

    const task = await Task.findOne({ _id: taskId, householdId })
      .populate('assignedTo', 'displayName profileColor');

    if (!task) {
      throw new AppError('No task found with that ID in this household.', 404);
    }

    res.status(200).json({
      status: 'success',
      data: { task },
    });
  },
);

export const getTask = getTaskById;

/**
 * @desc    Update a task (Parent only)
 * @route   PATCH /api/tasks/:id
 * @access  Private (Parent only)
 */
export const updateTask = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const taskId = req.params.id;
    const { householdId } = req;
    if (!householdId) throw new AppError('Authentication error', 401);

    const { title, description, pointsValue, assignedTo, dueDate, status } = req.body;

    const task = await Task.findOneAndUpdate(
      { _id: taskId, householdId },
      { title, description, pointsValue, assignedTo, dueDate, status },
      { new: true, runValidators: true },
    );

    if (!task) {
      throw new AppError('No task found with that ID in this household.', 404);
    }

    const io = req.app.get('io');
    emitTaskEvent(io, householdId, 'task_updated', {
      type: 'update',
      task
    });

    res.status(200).json({
      status: 'success',
      data: { task },
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
    const { householdId } = req;
    if (!householdId) throw new AppError('Authentication error', 401);

    const task = await Task.findOneAndDelete({
      _id: taskId,
      householdId,
    });

    if (!task) {
      throw new AppError('No task found with that ID in this household.', 404);
    }

    const io = req.app.get('io');
    emitTaskEvent(io, householdId, 'task_deleted', {
      type: 'delete',
      taskId
    });

    res.status(204).json({
      status: 'success',
      data: null,
    });
  },
);