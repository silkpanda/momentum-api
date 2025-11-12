// src/routes/householdRoutes.ts
import express from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  createHousehold,
  getMyHouseholds,
  addMemberToHousehold,
  updateMemberProfile,
  removeMemberFromHousehold,
} from '../controllers/householdController';

const router = express.Router();

// All routes below require a logged-in user, so we apply the 'protect' middleware first.
router.use(protect);

// -----------------------------------------------------------
// A. Core Household Routes (GET / POST)
// -----------------------------------------------------------

// @route   POST /api/households
// @desc    Create a new household (and adds the user as the first Parent member)
// @access  Private
router.route('/').post(createHousehold);

// @route   GET /api/households
// @desc    Get all households the logged-in user is a member of (for co-parenting support)
// @access  Private
router.route('/').get(getMyHouseholds);


// -----------------------------------------------------------
// B. Household Member Management Routes
// -----------------------------------------------------------
// These routes implement the new "Unified Membership Model" CRUD API
// The routes are nested under /households/:householdId as requested by the blueprint

// @route   POST /api/households/:householdId/members
// @desc    Add a new member to the household (Parent or Child)
// @access  Private (Parent role only, enforced in controller)
router
  .route('/:householdId/members')
  .post(addMemberToHousehold);

// @route   PATCH /api/households/:householdId/members/:memberProfileId
// @desc    Update a member's profile (displayName, color, role) within the household
// @access  Private (Parent role only, enforced in controller)
router
  .route('/:householdId/members/:memberProfileId')
  .patch(updateMemberProfile);

// @route   DELETE /api/households/:householdId/members/:memberProfileId
// @desc    Remove a member from the household
// @access  Private (Parent role only, enforced in controller)
router
  .route('/:householdId/members/:memberProfileId')
  .delete(removeMemberFromHousehold);


export default router;