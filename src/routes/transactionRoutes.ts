import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import { restrictTo } from '../controllers/authController';
import {
  createTask,
  getAllTasks,
  getTask,
  updateTask,
  deleteTask,
} from '../controllers/taskController';
import { completeTask } from '../controllers/transactionController'; // <-- NEW IMPORT

// Mandatory camelCase variable name for the Router instance
const router = Router();

// Routes after this middleware are restricted to Parents (for CRUD operations)
router.use(protect, restrictTo('Parent'));

// Routes for getting all tasks and creating a new task (Parent CRUD)
// GET /api/v1/tasks
// POST /api/v1/tasks
router.route('/')
    .get(getAllTasks)
    .post(createTask);

// Routes for individual task operations (Parent CRUD)
// GET /api/v1/tasks/:id
// PATCH /api/v1/tasks/:id
// DELETE /api/v1/tasks/:id
router.route('/:id')
    .get(getTask)
    .patch(updateTask)
    .delete(deleteTask);

// NEW ROUTE: Task Completion (Phase 3.3)
// This endpoint is protected, but accessible by any logged-in FamilyMember (Parent or Child)
// It uses the taskId route parameter.
// POST /api/v1/tasks/:taskId/complete
router.route('/:taskId/complete')
    .post(protect, completeTask); // Only needs 'protect' since both roles can complete a task.

export default router;