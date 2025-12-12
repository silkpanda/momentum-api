"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const authController_1 = require("../controllers/authController");
const taskController_1 = require("../controllers/taskController");
const taskCompletionController_1 = require("../controllers/taskCompletionController");
const router = (0, express_1.Router)();
// 1. All routes require login
router.use(authMiddleware_1.protect);
// 2. Public Routes (Parent & Child)
// Everyone needs to see tasks to know what to do!
router.route('/')
    .get(taskController_1.getAllTasks)
    .post((0, authController_1.restrictTo)('Parent'), taskController_1.createTask); // Only Parents create tasks
router.post('/:id/complete', taskCompletionController_1.completeTask); // Anyone can complete
// 3. Restricted Routes (Parent Only)
router.post('/:id/approve', (0, authController_1.restrictTo)('Parent'), taskCompletionController_1.approveTask);
router.post('/:id/reject', (0, authController_1.restrictTo)('Parent'), taskCompletionController_1.rejectTask);
router
    .route('/:id')
    .get(taskController_1.getTaskById) // Anyone can view details
    .patch((0, authController_1.restrictTo)('Parent'), taskController_1.updateTask)
    .delete((0, authController_1.restrictTo)('Parent'), taskController_1.deleteTask);
exports.default = router;
//# sourceMappingURL=taskRoutes.js.map