"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// silkpanda/momentum-api/momentum-api-556c5b7b5d534751fdc505eedf6113f20a02cc98/src/routes/householdRoutes.ts
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const authController_1 = require("../controllers/authController");
const householdController_1 = require("../controllers/householdController");
// Mandatory camelCase variable name for the Router instance
const router = (0, express_1.Router)();
// All routes after this middleware will be protected and restricted to 'Parent' role
router.use(authMiddleware_1.protect, (0, authController_1.restrictTo)('Parent'));
// Routes for listing all households and creating a new household (Parent CRUD)
// GET /api/v1/households
// POST /api/v1/households
router.route('/')
    .get(householdController_1.getAllHouseholds) // Get all households the Parent belongs to
    .post(householdController_1.createHousehold); // Create a new household
// Routes for individual household operations (Parent CRUD)
// GET /api/v1/households/:id
// PATCH /api/v1/households/:id
// DELETE /api/v1/households/:id
router.route('/:id')
    .get(householdController_1.getHousehold) // Get single household
    .patch(householdController_1.updateHousehold) // Update household details (e.g., name)
    .delete(householdController_1.deleteHousehold); // Delete household
// Nested routes for Family Member Management (Child Profiles)
// POST /api/v1/households/:id/members (Add Member)
router.route('/:id/members')
    .post(householdController_1.addFamilyMember);
// PATCH /api/v1/households/:id/members/:memberId (Update Member)
// DELETE /api/v1/households/:id/members/:memberId (Delete Member)
router.route('/:id/members/:memberId')
    .patch(householdController_1.updateFamilyMember)
    .delete(householdController_1.deleteFamilyMember);
exports.default = router;
//# sourceMappingURL=householdRoutes.js.map