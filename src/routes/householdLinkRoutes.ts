// src/routes/householdLinkRoutes.ts
import express from 'express';
import { protect } from '../middleware/authMiddleware';
import { restrictTo } from '../controllers/authController';
import {
    generateLinkCode,
    validateLinkCode,
    linkExistingChild,
    getLinkSettings,
    getHouseholdLinks,
    proposeSettingChange,
    approveChange,
    rejectChange,
    unlinkChild,
} from '../controllers/householdLinkController';

const router = express.Router();

// All routes require authentication
router.use(protect);

// All routes require Parent role
router.use(restrictTo('Parent'));

/**
 * @route   POST /api/v1/household/child/generate-link-code
 * @desc    Generate a link code for a child
 * @access  Parent only
 */
router.post('/child/generate-link-code', generateLinkCode);

/**
 * @route   POST /api/v1/household/child/link-existing
 * @desc    Link an existing child to this household using a code
 * @access  Parent only
 */
router.post('/child/link-existing', linkExistingChild);

/**
 * @route   GET /api/v1/household/child/validate-code/:code
 * @desc    Validate a link code without linking
 * @access  Parent only
 */
router.get('/child/validate-code/:code', validateLinkCode);

/**
 * @route   GET /api/v1/household/links
 * @desc    Get all household links for the current household
 * @access  Parent only
 */
router.get('/links', getHouseholdLinks);

/**
 * @route   GET /api/v1/household/link/:linkId/settings
 * @desc    Get sharing settings for a household link
 * @access  Parent only
 */
router.get('/link/:linkId/settings', getLinkSettings);

/**
 * @route   POST /api/v1/household/link/:linkId/propose-change
 * @desc    Propose a change to sharing settings
 * @access  Parent only
 */
router.post('/link/:linkId/propose-change', proposeSettingChange);

/**
 * @route   POST /api/v1/household/link/:linkId/approve-change/:changeId
 * @desc    Approve a pending change
 * @access  Parent only
 */
router.post('/link/:linkId/approve-change/:changeId', approveChange);

/**
 * @route   POST /api/v1/household/link/:linkId/reject-change/:changeId
 * @desc    Reject a pending change
 * @access  Parent only
 */
router.post('/link/:linkId/reject-change/:changeId', rejectChange);

/**
 * @route   POST /api/v1/household/child/:childId/unlink
 * @desc    Unlink a child from a household
 * @access  Parent only
 */
router.post('/child/:childId/unlink', unlinkChild);

export default router;
