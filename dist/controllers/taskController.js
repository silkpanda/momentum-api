"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTask = exports.updateTask = exports.getTask = exports.createTask = exports.getAllTasks = void 0;
const mongoose_1 = __importDefault(require("mongoose")); // <-- FIX: Import mongoose itself to access mongoose.Error.CastError
const Task_1 = __importDefault(require("../models/Task"));
// Helper to handle standard model CRUD response
const handleResponse = (res, status, message, data) => {
    res.status(status).json({
        status: status >= 400 ? 'fail' : 'success',
        message,
        data: data ? { task: data } : undefined,
    });
};
/**
 * Get all Tasks for the authenticated user's primary Household. (Phase 2.4)
 */
const getAllTasks = async (req, res) => {
    try {
        // Tasks must be retrieved within the user's household context
        const householdId = req.householdId;
        if (!householdId) {
            handleResponse(res, 400, 'Household context is missing from request.');
            return;
        }
        const tasks = await Task_1.default.find({ householdRefId: householdId }).populate('assignedToRefs', 'firstName profileColor');
        res.status(200).json({
            status: 'success',
            results: tasks.length,
            data: {
                tasks,
            },
        });
    }
    catch (err) {
        handleResponse(res, 500, 'Failed to retrieve tasks.', { error: err.message });
    }
};
exports.getAllTasks = getAllTasks;
/**
 * Create a new Task for the authenticated user's primary Household. (Phase 2.4)
 */
const createTask = async (req, res) => {
    try {
        const { taskName, description, pointsValue, recurrence, assignedToRefs } = req.body;
        // Validate mandatory fields
        if (!taskName || !pointsValue) {
            handleResponse(res, 400, 'Missing mandatory fields: taskName and pointsValue.');
            return;
        }
        const householdId = req.householdId;
        if (!householdId) {
            handleResponse(res, 400, 'Household context is missing from request.');
            return;
        }
        // Create the task, linking it to the Household from the JWT payload
        const newTask = await Task_1.default.create({
            taskName,
            description,
            pointsValue,
            recurrence,
            assignedToRefs,
            householdRefId: householdId, // CRITICAL: Scope task to the Household
            isCompleted: false, // Always start as false
        });
        handleResponse(res, 201, 'Task created successfully.', newTask);
    }
    catch (err) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to create task.',
            error: err.message,
        });
    }
};
exports.createTask = createTask;
/**
 * Get a single Task by ID. (Phase 2.4)
 */
const getTask = async (req, res) => {
    try {
        const taskId = req.params.id;
        const householdId = req.householdId;
        // Find the task by ID AND ensure it belongs to the current household
        const task = await Task_1.default.findOne({
            _id: taskId,
            householdRefId: householdId,
        }).populate('assignedToRefs', 'firstName'); // Populate to get assigned names
        if (!task) {
            handleResponse(res, 404, 'Task not found or does not belong to your household.');
            return;
        }
        handleResponse(res, 200, 'Task retrieved successfully.', task);
    }
    catch (err) {
        // FIX APPLIED: Use 'mongoose.Error.CastError' for correct TypeScript error checking
        if (err instanceof mongoose_1.default.Error.CastError) {
            handleResponse(res, 400, 'Invalid task ID format.');
            return;
        }
        handleResponse(res, 500, 'Failed to retrieve task.', { error: err.message });
    }
};
exports.getTask = getTask;
/**
 * Update a Task by ID. (Phase 2.4)
 */
const updateTask = async (req, res) => {
    try {
        const taskId = req.params.id;
        const householdId = req.householdId;
        // Prevent updating householdRefId or isCompleted status via this general update endpoint
        const updates = { ...req.body };
        delete updates.householdRefId;
        delete updates.isCompleted;
        // Find the task by ID and household ID, and then update it
        const updatedTask = await Task_1.default.findOneAndUpdate({
            _id: taskId,
            householdRefId: householdId,
        }, updates, { new: true, runValidators: true });
        if (!updatedTask) {
            handleResponse(res, 404, 'Task not found or does not belong to your household.');
            return;
        }
        handleResponse(res, 200, 'Task updated successfully.', updatedTask);
    }
    catch (err) {
        // FIX APPLIED: Use 'mongoose.Error.CastError' for correct TypeScript error checking
        if (err instanceof mongoose_1.default.Error.CastError) {
            handleResponse(res, 400, 'Invalid task ID format.');
            return;
        }
        res.status(500).json({
            status: 'error',
            message: 'Failed to update task.',
            error: err.message,
        });
    }
};
exports.updateTask = updateTask;
/**
 * Delete a Task by ID. (Phase 2.4)
 */
const deleteTask = async (req, res) => {
    try {
        const taskId = req.params.id;
        const householdId = req.householdId;
        // Find the task by ID AND ensure it belongs to the current household before deleting
        const deletedTask = await Task_1.default.findOneAndDelete({
            _id: taskId,
            householdRefId: householdId,
        });
        if (!deletedTask) {
            handleResponse(res, 404, 'Task not found or does not belong to your household.');
            return;
        }
        // Successful deletion returns 204 No Content
        res.status(204).json({
            status: 'success',
            data: null,
        });
    }
    catch (err) {
        // FIX APPLIED: Use 'mongoose.Error.CastError' for correct TypeScript error checking
        if (err instanceof mongoose_1.default.Error.CastError) {
            handleResponse(res, 400, 'Invalid task ID format.');
            return;
        }
        handleResponse(res, 500, 'Failed to delete task.', { error: err.message });
    }
};
exports.deleteTask = deleteTask;
//# sourceMappingURL=taskController.js.map