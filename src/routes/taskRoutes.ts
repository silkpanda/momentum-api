// silkpanda/momentum-api/momentum-api-556c5b7b5d534751fdc505eedf6113f20a02cc98/src/routes/taskRoutes.ts
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

// NEW ROUTE: Task Completion (Phase 3.3)
// POST /api/v1/tasks/:id/complete
// This route is NOT restricted to Parent, only requires basic protection.
router.route('/:id/complete') 
    .post(protect, completeTask); 

export default router;