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

// Mandatory camelCase variable name for the Router instance
const router = Router();

// All routes after this middleware will be protected and restricted to 'Parent' role
// Only Parents can manage (CRUD) the tasks themselves.
router.use(protect, restrictTo('Parent'));

// Routes for getting all tasks and creating a new task
// GET /api/v1/tasks
// POST /api/v1/tasks
router.route('/')
    .get(getAllTasks)
    .post(createTask);

// Routes for individual task operations
// GET /api/v1/tasks/:id
// PATCH /api/v1/tasks/:id
// DELETE /api/v1/tasks/:id
router.route('/:id')
    .get(getTask)
    .patch(updateTask)
    .delete(deleteTask);

export default router;