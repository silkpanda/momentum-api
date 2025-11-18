// src/routes/householdRoutes.ts
import express from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  createHousehold,
  getMyHouseholds,
  getHousehold,       // <-- NEW IMPORT
  updateHousehold,    // <-- NEW IMPORT
  deleteHousehold,    // <-- NEW IMPORT
  addMemberToHousehold,
  updateMemberProfile,
  removeMemberFromHousehold,
} from '../controllers/householdController';

const router = express.Router();

// All routes below require a logged-in user, so we apply the 'protect' middleware first.
router.use(protect);

// -----------------------------------------------------------
// A. Core Household Routes
// -----------------------------------------------------------

// @route   POST /api/households
// @desc    Create a new household
router.route('/').post(createHousehold);

// @route   GET /api/households
// @desc    Get all households the logged-in user is a member of
router.route('/').get(getMyHouseholds);

// @route   GET /api/households/:id
// @desc    Get, Update, or Delete a specific household by ID
// @access  Private
router.route('/:id')
  .get(getHousehold)
  .patch(updateHousehold)
  .delete(deleteHousehold);

// -----------------------------------------------------------
// B. Household Member Management Routes
// -----------------------------------------------------------

// @route   POST /api/households/:householdId/members
// @desc    Add a new member to the household (Parent or Child)
router
  .route('/:householdId/members')
  .post(addMemberToHousehold);

// @route   PATCH /api/households/:householdId/members/:memberProfileId
// @desc    Update a member's profile (displayName, color, role)
router
  .route('/:householdId/members/:memberProfileId')
  .patch(updateMemberProfile);

// @route   DELETE /api/households/:householdId/members/:memberProfileId
// @desc    Remove a member from the household
router
  .route('/:householdId/members/:memberProfileId')
  .delete(removeMemberFromHousehold);


export default router;