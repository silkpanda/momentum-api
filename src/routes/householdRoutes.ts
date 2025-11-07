import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import { restrictTo } from '../controllers/authController';
import { createHousehold } from '../controllers/householdController';

// Mandatory camelCase variable name for the Router instance
const router = Router();

// All routes after this middleware will be protected and restricted to 'Parent' role
router.use(protect, restrictTo('Parent'));

// POST /api/v1/households (Create Household)
// The parent's ID is pulled from the JWT payload by the 'protect' middleware
router.route('/').post(createHousehold);

// Routes for listing, updating, deleting will follow here in Phase 2.2

export default router;