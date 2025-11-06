import { Router } from 'express';
import { signup } from '../controllers/authController';

// Mandatory camelCase variable name for the Router instance
const router = Router();

// POST /api/v1/auth/signup
router.post('/signup', signup);

// ... login route will go here later

export default router;