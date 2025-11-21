"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/householdRoutes.ts
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const householdController_1 = require("../controllers/householdController");
const router = express_1.default.Router();
// All routes below require a logged-in user, so we apply the 'protect' middleware first.
router.use(authMiddleware_1.protect);
// -----------------------------------------------------------
// A. Core Household Routes
// -----------------------------------------------------------
// @route   POST /api/households/join
// @desc    Join a household via invite code
router.post('/join', householdController_1.joinHousehold);
// @route   POST /api/households
// @desc    Create a new household
router.route('/').post(householdController_1.createHousehold);
// @route   GET /api/households
// @desc    Get all households the logged-in user is a member of
router.route('/').get(householdController_1.getMyHouseholds);
// @route   GET /api/households/:id
// @desc    Get, Update, or Delete a specific household by ID
// @access  Private
router.route('/:id')
    .get(householdController_1.getHousehold)
    .patch(householdController_1.updateHousehold)
    .delete(householdController_1.deleteHousehold);
// -----------------------------------------------------------
// B. Invite System Routes
// -----------------------------------------------------------
router.route('/:id/invite-code')
    .get(householdController_1.getInviteCode)
    .post(householdController_1.regenerateInviteCode);
// -----------------------------------------------------------
// C. Household Member Management Routes
// -----------------------------------------------------------
// @route   POST /api/households/:householdId/members
// @desc    Add a new member to the household (Parent or Child)
router
    .route('/:householdId/members')
    .post(householdController_1.addMemberToHousehold);
// @route   PATCH /api/households/:householdId/members/:memberProfileId
// @desc    Update a member's profile (displayName, color, role)
router
    .route('/:householdId/members/:memberProfileId')
    .patch(householdController_1.updateMemberProfile);
// @route   DELETE /api/households/:householdId/members/:memberProfileId
// @desc    Remove a member from the household
router
    .route('/:householdId/members/:memberProfileId')
    .delete(householdController_1.removeMemberFromHousehold);
exports.default = router;
//# sourceMappingURL=householdRoutes.js.map