// silkpanda/momentum-api/momentum-api-556c5b7b5d534751fdc505eedf6113f20a02cc98/src/routes/authRoutes.ts
import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import { restrictTo, signup, login, getMe } from '../controllers/authController'; // Import all Auth controllers
// Removed imports for createHousehold, addFamilyMember

// Mandatory camelCase variable name for the Router instance
const router = Router();

// Non-protected routes (Auth)
// POST /api/v1/auth/signup (Parent Sign-Up)
// POST /api/v1/auth/login (Parent Login)
router.post('/signup', signup);
router.post('/login', login);

// All routes after this middleware will be protected by JWT
router.use(protect);

// Protected health check route: GET /api/v1/auth/me
router.get('/me', getMe);

// NOTE: All previously misplaced household/member management routes are now in householdRoutes.ts

export default router;