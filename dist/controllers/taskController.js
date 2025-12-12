"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTask = exports.updateTask = exports.getTask = exports.getTaskById = exports.getAllTasks = exports.createTask = void 0;
const express_async_handler_1 = __importDefault(require("express-async-handler"));
const Task_1 = __importDefault(require("../models/Task"));
const AppError_1 = __importDefault(require("../utils/AppError"));
const websocketHelper_1 = require("../utils/websocketHelper");
const householdSharingService_1 = require("../services/householdSharingService");
/**
 * @desc    Create a new task
 * @route   POST /api/tasks
 * @access  Private (Parent only)
 */
exports.createTask = (0, express_async_handler_1.default)(async (req, res) => {
    const { title, description, pointsValue, assignedTo, dueDate } = req.body;
    const { householdId } = req;
    if (!title || pointsValue === undefined || !assignedTo || assignedTo.length === 0) {
        throw new AppError_1.default('Missing required fields: title, pointsValue, and at least one assignedTo ID are required.', 400);
    }
    if (!householdId)
        throw new AppError_1.default('Authentication error', 401);
    const task = await Task_1.default.create({
        householdId,
        title,
        description,
        pointsValue,
        assignedTo,
        dueDate,
        status: 'Pending',
    });
    const io = req.app.get('io');
    (0, websocketHelper_1.emitTaskEvent)(io, householdId, 'task_created', {
        type: 'create',
        task
    });
    res.status(201).json({
        status: 'success',
        data: { task },
    });
});
/**
 * @desc    Get all tasks for the user's household
 * @route   GET /api/tasks
 * @access  Private
 */
exports.getAllTasks = (0, express_async_handler_1.default)(async (req, res) => {
    const { householdId } = req;
    if (!householdId)
        throw new AppError_1.default('Authentication error', 401);
    // 1. Fetch local tasks
    let tasks = await Task_1.default.find({ householdId })
        .populate('assignedTo', 'displayName profileColor')
        .sort({ createdAt: -1 });
    // 2. Fetch shared tasks from linked households
    const sharedTasks = await (0, householdSharingService_1.getSharedTasks)(householdId);
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
});
/**
 * @desc    Get a single task by its ID
 * @route   GET /api/tasks/:id
 * @access  Private
 */
exports.getTaskById = (0, express_async_handler_1.default)(async (req, res) => {
    const taskId = req.params.id;
    const { householdId } = req;
    const task = await Task_1.default.findOne({ _id: taskId, householdId })
        .populate('assignedTo', 'displayName profileColor');
    if (!task) {
        throw new AppError_1.default('No task found with that ID in this household.', 404);
    }
    res.status(200).json({
        status: 'success',
        data: { task },
    });
});
exports.getTask = exports.getTaskById;
/**
 * @desc    Update a task (Parent only)
 * @route   PATCH /api/tasks/:id
 * @access  Private (Parent only)
 */
exports.updateTask = (0, express_async_handler_1.default)(async (req, res) => {
    const taskId = req.params.id;
    const { householdId } = req;
    if (!householdId)
        throw new AppError_1.default('Authentication error', 401);
    const { title, description, pointsValue, assignedTo, dueDate, status } = req.body;
    const task = await Task_1.default.findOneAndUpdate({ _id: taskId, householdId }, { title, description, pointsValue, assignedTo, dueDate, status }, { new: true, runValidators: true });
    if (!task) {
        throw new AppError_1.default('No task found with that ID in this household.', 404);
    }
    const io = req.app.get('io');
    (0, websocketHelper_1.emitTaskEvent)(io, householdId, 'task_updated', {
        type: 'update',
        task
    });
    res.status(200).json({
        status: 'success',
        data: { task },
    });
});
/**
 * @desc    Delete a task (Parent only)
 * @route   DELETE /api/tasks/:id
 * @access  Private (Parent only)
 */
exports.deleteTask = (0, express_async_handler_1.default)(async (req, res) => {
    const taskId = req.params.id;
    const { householdId } = req;
    if (!householdId)
        throw new AppError_1.default('Authentication error', 401);
    const task = await Task_1.default.findOneAndDelete({
        _id: taskId,
        householdId,
    });
    if (!task) {
        throw new AppError_1.default('No task found with that ID in this household.', 404);
    }
    const io = req.app.get('io');
    (0, websocketHelper_1.emitTaskEvent)(io, householdId, 'task_deleted', {
        type: 'delete',
        taskId
    });
    res.status(204).json({
        status: 'success',
        data: null,
    });
});
//# sourceMappingURL=taskController.js.map