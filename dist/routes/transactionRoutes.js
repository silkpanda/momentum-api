"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const authController_1 = require("../controllers/authController");
const taskController_1 = require("../controllers/taskController");
const transactionController_1 = require("../controllers/transactionController"); // <-- NEW IMPORT
// Mandatory camelCase variable name for the Router instance
const router = (0, express_1.Router)();
// Routes after this middleware are restricted to Parents (for CRUD operations)
router.use(authMiddleware_1.protect, (0, authController_1.restrictTo)('Parent'));
// Routes for getting all tasks and creating a new task (Parent CRUD)
// GET /api/v1/tasks
// POST /api/v1/tasks
router.route('/')
    .get(taskController_1.getAllTasks)
    .post(taskController_1.createTask);
// Routes for individual task operations (Parent CRUD)
// GET /api/v1/tasks/:id
// PATCH /api/v1/tasks/:id
// DELETE /api/v1/tasks/:id
router.route('/:id')
    .get(taskController_1.getTask)
    .patch(taskController_1.updateTask)
    .delete(taskController_1.deleteTask);
// NEW ROUTE: Task Completion (Phase 3.3)
// This endpoint is protected, but accessible by any logged-in FamilyMember (Parent or Child)
// It uses the taskId route parameter.
// POST /api/v1/tasks/:taskId/complete
router.route('/:taskId/complete')
    .post(authMiddleware_1.protect, transactionController_1.completeTask); // Only needs 'protect' since both roles can complete a task.
exports.default = router;
//# sourceMappingURL=transactionRoutes.js.map