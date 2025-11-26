// src/controllers/householdLinkController.ts
import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import asyncHandler from 'express-async-handler';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import AppError from '../utils/AppError';
import FamilyMember from '../models/FamilyMember';
import Household from '../models/Household';
import HouseholdLink from '../models/HouseholdLink';
import ChildLinkCode from '../models/ChildLinkCode';

/**
 * Generate a link code for a child
 * POST /api/v1/household/child/generate-link-code
 * Body: { childId }
 */
export const generateLinkCode = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const { childId } = req.body;
        const householdId = req.householdId;
        const parentId = req.user!._id;

        if (!childId) {
            return next(new AppError('Child ID is required', 400));
        }

        // Verify child exists and belongs to this household
        const household = await Household.findById(householdId);
        if (!household) {
            return next(new AppError('Household not found', 404));
        }

        const childProfile = household.memberProfiles.find(
            (p) => p.familyMemberId.toString() === childId && p.role === 'Child'
        );

        if (!childProfile) {
            return next(new AppError('Child not found in this household', 404));
        }

        const child = await FamilyMember.findById(childId);
        if (!child) {
            return next(new AppError('Child not found', 404));
        }

        // Check if there's already an active code for this child
        const existingCode = await ChildLinkCode.findOne({
            childId,
            status: 'active',
            expiresAt: { $gt: new Date() },
        });

        if (existingCode) {
            // Return existing code if still valid
            res.status(200).json({
                status: 'success',
                data: {
                    code: existingCode.code,
                    expiresAt: existingCode.expiresAt,
                    childName: child.firstName,
                },
            });
            return;
        }

        // Generate new code
        const code = await (ChildLinkCode as any).generateCode(child.firstName);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

        const linkCode = await ChildLinkCode.create({
            childId,
            code,
            createdBy: parentId,
            householdId,
            expiresAt,
            status: 'active',
        });

        res.status(201).json({
            status: 'success',
            data: {
                code: linkCode.code,
                expiresAt: linkCode.expiresAt,
                childName: child.firstName,
            },
        });
    }
);

/**
 * Link an existing child to this household using a code
 * POST /api/v1/household/child/link-existing
 * Body: { code, displayName, profileColor }
 */
export const linkExistingChild = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const { code, displayName, profileColor } = req.body;
        const householdId = req.householdId;
        const parentId = req.user!._id;

        if (!code || !displayName || !profileColor) {
            return next(new AppError('Code, display name, and profile color are required', 400));
        }

        // Find and validate the link code
        const linkCode = await ChildLinkCode.findOne({ code: code.toUpperCase() });

        if (!linkCode) {
            return next(new AppError('Invalid link code', 404));
        }

        if (!(linkCode as any).isValid()) {
            return next(new AppError('This link code has expired or been used', 400));
        }

        // Check if child is already in this household
        const household = await Household.findById(householdId);
        if (!household) {
            return next(new AppError('Household not found', 404));
        }

        const alreadyMember = household.memberProfiles.some(
            (p) => p.familyMemberId.toString() === linkCode.childId.toString()
        );

        if (alreadyMember) {
            return next(new AppError('This child is already a member of your household', 400));
        }

        // Check if child is already linked to this household
        const existingLink = await HouseholdLink.findOne({
            childId: linkCode.childId,
            $or: [
                { household1: householdId },
                { household2: householdId },
                { household1: linkCode.householdId },
                { household2: linkCode.householdId },
            ],
        });

        if (existingLink) {
            return next(new AppError('This child is already linked between these households', 400));
        }

        // Get the child
        const child = await FamilyMember.findById(linkCode.childId);
        if (!child) {
            return next(new AppError('Child not found', 404));
        }

        // Add child to this household
        household.memberProfiles.push({
            familyMemberId: linkCode.childId as Types.ObjectId,
            displayName,
            profileColor,
            role: 'Child',
            pointsTotal: 0,
        });
        await household.save();

        // Create household link with default settings (all separate)
        const householdLink = await HouseholdLink.create({
            childId: linkCode.childId,
            household1: linkCode.householdId,
            household2: householdId,
            linkCode: code.toUpperCase(),
            createdBy: linkCode.createdBy,
            acceptedBy: parentId,
            sharingSettings: {
                points: 'separate',
                xp: 'separate',
                streaks: 'separate',
                tasks: 'separate',
                quests: 'separate',
                routines: 'separate',
                store: 'separate',
                wishlist: 'separate',
                calendar: 'separate',
            },
            pendingChanges: [],
            proposalHistory: [],
            status: 'active',
        });

        // Add linked household to child's record
        if (!child.linkedHouseholds) {
            child.linkedHouseholds = [];
        }

        child.linkedHouseholds.push({
            householdId: householdId as Types.ObjectId,
            linkCode: code.toUpperCase(),
            linkedAt: new Date(),
            linkedBy: parentId as Types.ObjectId,
            householdSpecificData: {
                points: 0,
                xp: 0,
                currentStreak: 0,
                streakLastUpdated: new Date(),
            },
        });

        await child.save();

        // Mark code as used (expires immediately for security)
        await (linkCode as any).markAsUsed(householdId);

        res.status(201).json({
            status: 'success',
            data: {
                child: {
                    _id: child._id,
                    firstName: child.firstName,
                    lastName: child.lastName,
                },
                householdLink,
                message: 'Child successfully linked to your household',
            },
        });
    }
);

/**
 * Get sharing settings for a household link
 * GET /api/v1/household/link/:linkId/settings
 */
export const getLinkSettings = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const { linkId } = req.params;
        const householdId = req.householdId;

        const link = await HouseholdLink.findById(linkId)
            .populate('childId', 'firstName lastName')
            .populate('household1', 'householdName')
            .populate('household2', 'householdName');

        if (!link) {
            return next(new AppError('Household link not found', 404));
        }

        // Verify user has access to this link
        if (
            link.household1.toString() !== householdId?.toString() &&
            link.household2.toString() !== householdId?.toString()
        ) {
            return next(new AppError('You do not have access to this household link', 403));
        }

        res.status(200).json({
            status: 'success',
            data: {
                link,
            },
        });
    }
);

/**
 * Get all household links for the current household
 * GET /api/v1/household/links
 */
export const getHouseholdLinks = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const householdId = req.householdId;

        const links = await HouseholdLink.find({
            $or: [{ household1: householdId }, { household2: householdId }],
            status: 'active',
        })
            .populate('childId', 'firstName lastName email')
            .populate('household1', 'householdName')
            .populate('household2', 'householdName');

        res.status(200).json({
            status: 'success',
            data: {
                links,
                count: links.length,
            },
        });
    }
);

/**
 * Propose a change to sharing settings
 * POST /api/v1/household/link/:linkId/propose-change
 * Body: { setting, newValue }
 */
export const proposeSettingChange = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const { linkId } = req.params;
        const { setting, newValue } = req.body;
        const householdId = req.householdId;
        const parentId = req.user!._id;

        if (!setting || !newValue) {
            return next(new AppError('Setting and new value are required', 400));
        }

        const validSettings = ['points', 'xp', 'streaks', 'tasks', 'quests', 'routines', 'store', 'wishlist', 'calendar'];
        if (!validSettings.includes(setting)) {
            return next(new AppError('Invalid setting', 400));
        }

        if (!['shared', 'separate'].includes(newValue)) {
            return next(new AppError('Value must be either "shared" or "separate"', 400));
        }

        const link = await HouseholdLink.findById(linkId);
        if (!link) {
            return next(new AppError('Household link not found', 404));
        }

        // Verify user has access
        if (
            link.household1.toString() !== householdId?.toString() &&
            link.household2.toString() !== householdId?.toString()
        ) {
            return next(new AppError('You do not have access to this household link', 403));
        }

        // Check if setting is already at the proposed value
        if ((link.sharingSettings as any)[setting] === newValue) {
            return next(new AppError(`Setting is already set to "${newValue}"`, 400));
        }

        // Check rate limiting (max 3 proposals per setting per week)
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const recentProposals = link.proposalHistory.filter(
            (p) =>
                p.setting === setting &&
                p.proposedBy.toString() === parentId?.toString() &&
                p.proposedAt > oneWeekAgo
        );

        if (recentProposals.length >= 3) {
            return next(new AppError('Rate limit exceeded. Maximum 3 proposals per week for this setting.', 429));
        }

        // Check for cooldown period (7 days after rejection)
        const lastRejection = link.pendingChanges
            .filter(
                (pc) =>
                    pc.setting === setting &&
                    pc.status === 'rejected' &&
                    pc.proposedByHousehold.toString() === householdId?.toString()
            )
            .sort((a, b) => b.proposedAt.getTime() - a.proposedAt.getTime())[0];

        if (lastRejection) {
            const cooldownEnd = new Date(lastRejection.proposedAt);
            cooldownEnd.setDate(cooldownEnd.getDate() + 7);

            if (new Date() < cooldownEnd) {
                return next(
                    new AppError(
                        `Cooldown period active. You can propose this change again after ${cooldownEnd.toLocaleDateString()}.`,
                        429
                    )
                );
            }
        }

        // Create pending change
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days to respond

        link.pendingChanges.push({
            proposedBy: parentId as Types.ObjectId,
            proposedByHousehold: householdId as Types.ObjectId,
            proposedAt: new Date(),
            setting: setting as any,
            currentValue: (link.sharingSettings as any)[setting],
            proposedValue: newValue as any,
            status: 'pending',
            expiresAt,
            previousRejections: lastRejection ? lastRejection.previousRejections + 1 : 0,
            canRepropose: true,
        });

        // Add to proposal history
        link.proposalHistory.push({
            setting,
            proposedAt: new Date(),
            proposedBy: parentId as Types.ObjectId,
        });

        await link.save();

        res.status(201).json({
            status: 'success',
            data: {
                message: 'Change proposal submitted',
                pendingChange: link.pendingChanges[link.pendingChanges.length - 1],
            },
        });
    }
);

/**
 * Approve a pending change
 * POST /api/v1/household/link/:linkId/approve-change/:changeId
 */
export const approveChange = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const { linkId, changeId } = req.params;
        const householdId = req.householdId;

        const link = await HouseholdLink.findById(linkId);
        if (!link) {
            return next(new AppError('Household link not found', 404));
        }

        // Verify user has access
        if (
            link.household1.toString() !== householdId?.toString() &&
            link.household2.toString() !== householdId?.toString()
        ) {
            return next(new AppError('You do not have access to this household link', 403));
        }

        // Find the pending change
        const changeIndex = link.pendingChanges.findIndex((pc) => pc._id?.toString() === changeId);

        if (changeIndex === -1) {
            return next(new AppError('Pending change not found', 404));
        }

        const change = link.pendingChanges[changeIndex];

        // Verify user is from the OTHER household (can't approve own proposal)
        if (change.proposedByHousehold.toString() === householdId?.toString()) {
            return next(new AppError('You cannot approve your own proposal', 403));
        }

        // Check if change has expired
        if (change.expiresAt < new Date()) {
            change.status = 'expired';
            await link.save();
            return next(new AppError('This change proposal has expired', 400));
        }

        // Apply the change
        (link.sharingSettings as any)[change.setting] = change.proposedValue;
        change.status = 'approved';

        await link.save();

        res.status(200).json({
            status: 'success',
            data: {
                message: 'Change approved and applied',
                updatedSettings: link.sharingSettings,
            },
        });
    }
);

/**
 * Reject a pending change
 * POST /api/v1/household/link/:linkId/reject-change/:changeId
 */
export const rejectChange = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const { linkId, changeId } = req.params;
        const householdId = req.householdId;

        const link = await HouseholdLink.findById(linkId);
        if (!link) {
            return next(new AppError('Household link not found', 404));
        }

        // Verify user has access
        if (
            link.household1.toString() !== householdId?.toString() &&
            link.household2.toString() !== householdId?.toString()
        ) {
            return next(new AppError('You do not have access to this household link', 403));
        }

        // Find the pending change
        const changeIndex = link.pendingChanges.findIndex((pc) => pc._id?.toString() === changeId);

        if (changeIndex === -1) {
            return next(new AppError('Pending change not found', 404));
        }

        const change = link.pendingChanges[changeIndex];

        // Verify user is from the OTHER household (can't reject own proposal)
        if (change.proposedByHousehold.toString() === householdId?.toString()) {
            return next(new AppError('You cannot reject your own proposal', 403));
        }

        // Reject the change
        change.status = 'rejected';
        change.lastRejectedAt = new Date();
        change.previousRejections = (change.previousRejections || 0) + 1;

        await link.save();

        res.status(200).json({
            status: 'success',
            data: {
                message: 'Change rejected',
            },
        });
    }
);

/**
 * Unlink a child from a household
 * POST /api/v1/household/child/:childId/unlink
 */
export const unlinkChild = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const { childId } = req.params;
        const householdId = req.householdId;

        // Find the link
        const link = await HouseholdLink.findOne({
            childId,
            $or: [{ household1: householdId }, { household2: householdId }],
            status: 'active',
        });

        if (!link) {
            return next(new AppError('Active household link not found', 404));
        }

        // Update link status
        link.status = 'unlinked';
        await link.save();

        // Remove child from household member profiles
        const household = await Household.findById(householdId);
        if (household) {
            household.memberProfiles = household.memberProfiles.filter(
                (p) => p.familyMemberId.toString() !== childId
            );
            await household.save();
        }

        // Remove household from child's linkedHouseholds
        // Note: We keep the data in the HouseholdLink record if needed for recovery,
        // but for now we remove it from the active linkedHouseholds array
        const child = await FamilyMember.findById(childId);
        if (child && child.linkedHouseholds) {
            child.linkedHouseholds = child.linkedHouseholds.filter(
                (h) => h.householdId.toString() !== householdId?.toString()
            );
            await child.save();
        }

        res.status(200).json({
            status: 'success',
            data: {
                message: 'Child successfully unlinked from household',
            },
        });
    }
);
