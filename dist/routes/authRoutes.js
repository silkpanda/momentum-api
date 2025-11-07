"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// silkpanda/momentum-api/momentum-api-556c5b7b5d534751fdc505eedf6113f20a02cc98/src/routes/authRoutes.ts
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const authController_1 = require("../controllers/authController"); // Import all Auth controllers
// Removed imports for createHousehold, addFamilyMember
// Mandatory camelCase variable name for the Router instance
const router = (0, express_1.Router)();
// Non-protected routes (Auth)
// POST /api/v1/auth/signup (Parent Sign-Up)
// POST /api/v1/auth/login (Parent Login)
router.post('/signup', authController_1.signup);
router.post('/login', authController_1.login);
// All routes after this middleware will be protected by JWT
router.use(authMiddleware_1.protect);
// Protected health check route: GET /api/v1/auth/me
router.get('/me', authController_1.getMe);
// NOTE: All previously misplaced household/member management routes are now in householdRoutes.ts
exports.default = router;
//# sourceMappingURL=authRoutes.js.map