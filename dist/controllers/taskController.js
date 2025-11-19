"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.approveTask = exports.completeTask = exports.deleteTask = exports.updateTask = exports.getTask = exports.getTaskById = exports.getAllTasks = exports.createTask = void 0;
const express_async_handler_1 = __importDefault(require("express-async-handler"));
const Task_1 = __importDefault(require("../models/Task"));
const Household_1 = __importDefault(require("../models/Household"));
const AppError_1 = __importDefault(require("../utils/AppError"));
/**
 * @desc    Create a new task
 * @route   POST /api/tasks
 * @access  Private (Parent only)
 */
exports.createTask = (0, express_async_handler_1.default)(async (req, res) => {
    const { title, description, pointsValue, assignedTo, dueDate } = req.body;
    const householdId = req.householdId; // From JWT
    if (!title || pointsValue === undefined || !assignedTo || assignedTo.length === 0) {
        throw new AppError_1.default('Missing required fields: title, pointsValue, and at least one assignedTo ID are required.', 400);
    }
    const task = await Task_1.default.create({
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
});
/**
 * @desc    Get all tasks for the user's household
 * @route   GET /api/tasks
 * @access  Private
 */
exports.getAllTasks = (0, express_async_handler_1.default)(async (req, res) => {
    const householdId = req.householdId; // From JWT
    const tasks = await Task_1.default.find({ householdId: householdId })
        .populate('assignedTo', 'displayName profileColor') // Populate member details
        .sort({ createdAt: -1 });
    res.status(200).json({
        status: 'success',
        results: tasks.length,
        data: {
            tasks,
        },
    });
});
/**
 * @desc    Get a single task by its ID
 * @route   GET /api/tasks/:id
 * @access  Private
 */
exports.getTaskById = (0, express_async_handler_1.default)(async (req, res) => {
    const taskId = req.params.id;
    const householdId = req.householdId;
    const task = await Task_1.default.findOne({ _id: taskId, householdId: householdId })
        .populate('assignedTo', 'displayName profileColor');
    if (!task) {
        throw new AppError_1.default('No task found with that ID in this household.', 404);
    }
    res.status(200).json({
        status: 'success',
        data: {
            task,
        },
    });
});
// ALIAS: Export getTask as an alias for getTaskById to support legacy routes
exports.getTask = exports.getTaskById;
/**
 * @desc    Update a task (Parent only)
 * @route   PATCH /api/tasks/:id
 * @access  Private (Parent only)
 */
exports.updateTask = (0, express_async_handler_1.default)(async (req, res) => {
    const taskId = req.params.id;
    const householdId = req.householdId;
    // Parents can update these fields
    const { title, description, pointsValue, assignedTo, dueDate, status } = req.body;
    const task = await Task_1.default.findOneAndUpdate({ _id: taskId, householdId: householdId }, { title, description, pointsValue, assignedTo, dueDate, status }, { new: true, runValidators: true });
    if (!task) {
        throw new AppError_1.default('No task found with that ID in this household.', 404);
    }
    res.status(200).json({
        status: 'success',
        data: {
            task,
        },
    });
});
/**
 * @desc    Delete a task (Parent only)
 * @route   DELETE /api/tasks/:id
 * @access  Private (Parent only)
 */
exports.deleteTask = (0, express_async_handler_1.default)(async (req, res) => {
    const taskId = req.params.id;
    const householdId = req.householdId;
    const task = await Task_1.default.findOneAndDelete({
        _id: taskId,
        householdId: householdId,
    });
    if (!task) {
        throw new AppError_1.default('No task found with that ID in this household.', 404);
    }
    res.status(204).json({
        status: 'success',
        data: null,
    });
});
// -----------------------------------------------------------------
// --- V4 TASK COMPLETION & APPROVAL FLOW (STEP 3.3) ---
// -----------------------------------------------------------------
/**
 * @desc    Mark a task as complete (for any member)
 * @route   POST /api/tasks/:id/complete
 * @access  Private
 */
exports.completeTask = (0, express_async_handler_1.default)(async (req, res) => {
    const taskId = req.params.id;
    const householdId = req.householdId;
    const loggedInUserId = req.user?._id;
    const { memberId } = req.body;
    // 1. Find the household
    const household = await Household_1.default.findById(householdId);
    if (!household) {
        throw new AppError_1.default('Household not found.', 404);
    }
    // 2. Determine which member is completing the task
    let memberProfile;
    if (memberId) {
        // Case A: Kiosk Mode / Explicit Member ID
        // Verify that this memberId exists in the household
        memberProfile = household.memberProfiles.find((p) => p._id?.equals(memberId));
        if (!memberProfile) {
            throw new AppError_1.default('Member not found in this household.', 404);
        }
    }
    else {
        // Case B: Implicit (User completing their own task - e.g., Parent)
        memberProfile = household.memberProfiles.find((p) => p.familyMemberId.equals(loggedInUserId));
        if (!memberProfile) {
            throw new AppError_1.default('Your member profile was not found in this household.', 404);
        }
    }
    // 3. Find the task
    const task = await Task_1.default.findOne({ _id: taskId, householdId: householdId });
    if (!task) {
        throw new AppError_1.default('Task not found.', 404);
    }
    // 4. Check if member is assigned to this task
    // We use .toString() for reliable comparison of ObjectIds
    const isAssigned = task.assignedTo.some((assignedId) => assignedId.toString() === memberProfile._id.toString());
    if (!isAssigned) {
        throw new AppError_1.default('This member is not assigned to this task.', 403);
    }
    // 5. Update the task status
    task.status = 'PendingApproval';
    task.completedBy = memberProfile._id; // Track who completed it
    await task.save();
    res.status(200).json({
        status: 'success',
        message: 'Task marked for approval.',
        data: {
            task,
        },
    });
});
/**
 * @desc    Approve a completed task (Parent only)
 * @route   POST /api/tasks/:id/approve
 * @access  Private (Parent only)
 */
exports.approveTask = (0, express_async_handler_1.default)(async (req, res) => {
    const taskId = req.params.id;
    const householdId = req.householdId;
    // 1. Find the task
    const task = await Task_1.default.findOne({
        _id: taskId,
        householdId: householdId,
        status: 'PendingApproval', // Can only approve tasks that are pending
    });
    if (!task) {
        throw new AppError_1.default('Task not found or is not pending approval.', 404);
    }
    if (!task.completedBy) {
        throw new AppError_1.default('Task cannot be approved: completedBy field is missing.', 400);
    }
    // 2. Find the household to update points
    const household = await Household_1.default.findById(householdId);
    if (!household) {
        throw new AppError_1.default('Household not found.', 404);
    }
    // 3. Find the member profile who completed the task
    const memberProfile = household.memberProfiles.find((p) => p._id?.equals(task.completedBy));
    if (!memberProfile) {
        throw new AppError_1.default('Member profile who completed task not found.', 404);
    }
    // 4. Atomically update the member's points and save the task status
    memberProfile.pointsTotal = (memberProfile.pointsTotal || 0) + task.pointsValue;
    await household.save();
    // Update task status
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
});
//# sourceMappingURL=taskController.js.map