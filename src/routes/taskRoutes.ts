import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import { restrictTo } from '../controllers/authController';
import {
  createTask,
  getAllTasks,
  getTaskById,
  updateTask,
  deleteTask,
  completeTask, // <-- NEW IMPORT
  approveTask, // <-- NEW IMPORT
} from '../controllers/taskController';

const router = Router();

// All routes are protected
router.use(protect);

// Get all tasks (for the household in the token)
router.get('/', getAllTasks);

// Parent-only routes
router.post('/', restrictTo('Parent'), createTask);

// --- NEW V4 COMPLETION ROUTES (STEP 3.3) ---

// Any authenticated member can mark a task as complete
router.post('/:id/complete', completeTask);

// Only a Parent can approve a task
router.post('/:id/approve', restrictTo('Parent'), approveTask);

// --- END OF NEW ROUTES ---

router
  .route('/:id')
  .get(getTaskById)
  .patch(restrictTo('Parent'), updateTask)
  .delete(restrictTo('Parent'), deleteTask);

export default router;