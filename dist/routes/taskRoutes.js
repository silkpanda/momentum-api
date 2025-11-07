"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// silkpanda/momentum-api/momentum-api-556c5b7b5d534751fdc505eedf6113f20a02cc98/src/routes/taskRoutes.ts
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const authController_1 = require("../controllers/authController");
const taskController_1 = require("../controllers/taskController");
const transactionController_1 = require("../controllers/transactionController"); // <-- NEW IMPORT
// Mandatory camelCase variable name for the Router instance
const router = (0, express_1.Router)();
// All routes after this middleware will be protected and restricted to 'Parent' role
// Only Parents can manage (CRUD) the tasks themselves.
router.use(authMiddleware_1.protect, (0, authController_1.restrictTo)('Parent'));
// Routes for getting all tasks and creating a new task
// GET /api/v1/tasks
// POST /api/v1/tasks
router.route('/')
    .get(taskController_1.getAllTasks)
    .post(taskController_1.createTask);
// Routes for individual task operations
// GET /api/v1/tasks/:id
// PATCH /api/v1/tasks/:id
// DELETE /api/v1/tasks/:id
router.route('/:id')
    .get(taskController_1.getTask)
    .patch(taskController_1.updateTask)
    .delete(taskController_1.deleteTask);
// NEW ROUTE: Task Completion (Phase 3.3)
// POST /api/v1/tasks/:id/complete
// This route is NOT restricted to Parent, only requires basic protection.
router.route('/:id/complete')
    .post(authMiddleware_1.protect, transactionController_1.completeTask);
exports.default = router;
//# sourceMappingURL=taskRoutes.js.map