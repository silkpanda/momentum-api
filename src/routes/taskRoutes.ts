import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import { restrictTo } from '../controllers/authController';
import {
  createTask,
  getAllTasks,
  getTaskById,
  updateTask,
  deleteTask,
  completeTask,
  approveTask,
  rejectTask,
} from '../controllers/taskController';

const router = Router();

// 1. All routes require login
router.use(protect);

// 2. Public Routes (Parent & Child)
// Everyone needs to see tasks to know what to do!
router.route('/')
  .get(getAllTasks)
  .post(restrictTo('Parent'), createTask); // Only Parents create tasks

router.post('/:id/complete', completeTask); // Anyone can complete

// 3. Restricted Routes (Parent Only)
router.post('/:id/approve', restrictTo('Parent'), approveTask);
router.post('/:id/reject', restrictTo('Parent'), rejectTask);

router
  .route('/:id')
  .get(getTaskById) // Anyone can view details
  .patch(restrictTo('Parent'), updateTask)
  .delete(restrictTo('Parent'), deleteTask);

export default router;