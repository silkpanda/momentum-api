"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.joinHousehold = exports.regenerateInviteCode = exports.getInviteCode = exports.removeMemberFromHousehold = exports.updateMemberProfile = exports.addMemberToHousehold = exports.deleteHousehold = exports.updateHousehold = exports.getHousehold = exports.getMyHouseholds = exports.createHousehold = void 0;
const express_async_handler_1 = __importDefault(require("express-async-handler"));
const mongoose_1 = require("mongoose"); // Import mongoose for CastError check
const Household_1 = __importDefault(require("../models/Household"));
const FamilyMember_1 = __importDefault(require("../models/FamilyMember"));
const Task_1 = __importDefault(require("../models/Task")); // Required for cleanup
const StoreItem_1 = __importDefault(require("../models/StoreItem")); // Required for cleanup
const AppError_1 = __importDefault(require("../utils/AppError"));
const server_1 = require("../server"); // Import Socket.io instance
/**
 * @desc    Create a new household
 * @route   POST /api/households
 * @access  Private
 */
exports.createHousehold = (0, express_async_handler_1.default)(async (req, res) => {
    const { householdName, userDisplayName, userProfileColor } = req.body;
    const creatorFamilyMemberId = req.user?._id;
    if (!creatorFamilyMemberId) {
        throw new AppError_1.default('Authentication error. User not found.', 401);
    }
    if (!householdName || !userDisplayName || !userProfileColor) {
        throw new AppError_1.default('Missing required fields: householdName, userDisplayName, and userProfileColor are all required.', 400);
    }
    const creatorProfile = {
        familyMemberId: creatorFamilyMemberId,
        displayName: userDisplayName,
        profileColor: userProfileColor,
        role: 'Parent',
        pointsTotal: 0,
    };
    const household = await Household_1.default.create({
        householdName,
        memberProfiles: [creatorProfile],
    });
    res.status(201).json(household);
});
/**
 * @desc    Get the primary household for the current user's session context
 * @route   GET /api/households
 * @access  Private
 */
exports.getMyHouseholds = (0, express_async_handler_1.default)(async (req, res) => {
    const householdId = req.householdId;
    if (!householdId) {
        throw new AppError_1.default('Household context not found in session token.', 401);
    }
    const household = await Household_1.default.findById(householdId).populate({
        path: 'memberProfiles.familyMemberId',
        select: 'firstName email linkedHouseholds',
    });
    if (!household) {
        throw new AppError_1.default('Primary household not found.', 404);
    }
    res.status(200).json({
        status: 'success',
        data: household,
    });
});
/**
 * @desc    Get a single household by ID
 * @route   GET /api/households/:id
 * @access  Private
 */
exports.getHousehold = (0, express_async_handler_1.default)(async (req, res) => {
    const { id } = req.params;
    const userId = req.user?._id;
    if (!userId) {
        throw new AppError_1.default('Authentication error. User not found.', 401);
    }
    // Fetch and populate (transforms familyMemberId into an Object)
    const household = await Household_1.default.findById(id).populate({
        path: 'memberProfiles.familyMemberId',
        select: 'firstName email linkedHouseholds',
    });
    if (!household) {
        throw new AppError_1.default('Household not found.', 404);
    }
    // FIX: Handle the populated object correctly
    const isMember = household.memberProfiles.some((p) => {
        // Because we populated, familyMemberId is now an object (IFamilyMember)
        // We cast to 'any' to access _id safely without TS complaining about the union type
        const memberDoc = p.familyMemberId;
        // Check if it has an _id (populated) or is just an ID (unpopulated fallback)
        const memberId = memberDoc._id || memberDoc;
        return memberId.toString() === userId.toString();
    });
    if (!isMember) {
        throw new AppError_1.default('You are not a member of this household.', 403);
    }
    res.status(200).json({
        status: 'success',
        data: household,
    });
});
/**
 * @desc    Update a household (e.g., rename)
 * @route   PATCH /api/households/:id
 * @access  Private (Parent only)
 */
exports.updateHousehold = (0, express_async_handler_1.default)(async (req, res) => {
    const { id } = req.params;
    const { householdName } = req.body;
    const userId = req.user?._id;
    if (!userId) {
        throw new AppError_1.default('Authentication error. User not found.', 401);
    }
    if (!householdName) {
        throw new AppError_1.default('householdName is required for update.', 400);
    }
    // Note: No populate here, so familyMemberId remains an ObjectId
    const household = await Household_1.default.findById(id);
    if (!household) {
        throw new AppError_1.default('Household not found.', 404);
    }
    // Authorization: Only a Parent of THIS household can update it
    const memberProfile = household.memberProfiles.find((p) => p.familyMemberId.toString() === userId.toString());
    if (!memberProfile || memberProfile.role !== 'Parent') {
        throw new AppError_1.default('Unauthorized. Only Parents can update household details.', 403);
    }
    household.householdName = householdName;
    await household.save();
    // Emit real-time update
    server_1.io.emit('household_updated', { type: 'update', householdId: id, householdName });
    res.status(200).json({
        status: 'success',
        data: household,
    });
});
/**
 * @desc    Delete a household
 * @route   DELETE /api/households/:id
 * @access  Private (Parent only)
 */
exports.deleteHousehold = (0, express_async_handler_1.default)(async (req, res) => {
    const { id } = req.params;
    const userId = req.user?._id;
    if (!userId) {
        throw new AppError_1.default('Authentication error. User not found.', 401);
    }
    const household = await Household_1.default.findById(id);
    if (!household) {
        throw new AppError_1.default('Household not found.', 404);
    }
    // Authorization: Only a Parent of THIS household can delete it
    const memberProfile = household.memberProfiles.find((p) => p.familyMemberId.toString() === userId.toString());
    if (!memberProfile || memberProfile.role !== 'Parent') {
        throw new AppError_1.default('Unauthorized. Only Parents can delete a household.', 403);
    }
    // Cascade Delete: Clean up related data
    await Task_1.default.deleteMany({ householdRefId: id });
    await StoreItem_1.default.deleteMany({ householdRefId: id });
    await Household_1.default.findByIdAndDelete(id);
    res.status(204).json({
        status: 'success',
        data: null,
    });
});
/**
 * @desc    Add a new member to a household
 * @route   POST /api/households/:householdId/members
 * @access  Private (Parent only)
 */
exports.addMemberToHousehold = (0, express_async_handler_1.default)(async (req, res) => {
    const { householdId } = req.params;
    let { familyMemberId, firstName, displayName, profileColor, role } = req.body;
    const loggedInUserId = req.user?._id;
    if (!loggedInUserId) {
        throw new AppError_1.default('Authentication error. User not found.', 401);
    }
    if (!displayName || !profileColor || !role) {
        if (!familyMemberId && (!firstName || !role)) {
            throw new AppError_1.default('Missing required fields: displayName, profileColor, and role are required. For new members, firstName is also required.', 400);
        }
    }
    if (!familyMemberId) {
        if (role !== 'Child') {
            throw new AppError_1.default('Only the "Child" role can be created through this endpoint without a familyMemberId.', 400);
        }
        const newChild = await FamilyMember_1.default.create({
            firstName,
            lastName: 'Household',
            email: `${firstName.toLowerCase().replace(/\s/g, '')}-child-${new Date().getTime()}@momentum.com`,
            password: `temp-${Math.random()}`,
        });
        familyMemberId = newChild._id;
    }
    const household = await Household_1.default.findById(householdId);
    if (!household) {
        throw new AppError_1.default('Household not found.', 404);
    }
    const isParent = household.memberProfiles.some((member) => member.familyMemberId.equals(loggedInUserId) &&
        member.role === 'Parent');
    if (!isParent) {
        throw new AppError_1.default('Unauthorized. Only parents of this household can add new members.', 403);
    }
    const isAlreadyMember = household.memberProfiles.some((member) => member.familyMemberId.equals(familyMemberId));
    if (isAlreadyMember) {
        throw new AppError_1.default('This family member is already in the household.', 400);
    }
    const memberExists = await FamilyMember_1.default.findById(familyMemberId);
    if (!memberExists) {
        throw new AppError_1.default('No family member found with the provided ID.', 404);
    }
    const newMemberProfile = {
        familyMemberId: new mongoose_1.Types.ObjectId(familyMemberId),
        displayName: displayName || memberExists.firstName,
        profileColor: profileColor,
        role: role,
        pointsTotal: 0,
    };
    household.memberProfiles.push(newMemberProfile);
    const updatedHousehold = await household.save();
    const finalHousehold = await updatedHousehold.populate({
        path: 'memberProfiles.familyMemberId',
        select: 'firstName email linkedHouseholds',
    });
    // Emit real-time update
    server_1.io.emit('household_updated', { type: 'member_add', householdId, member: finalHousehold.memberProfiles.find((p) => p.familyMemberId.equals(familyMemberId)) });
    res.status(201).json({
        status: 'success',
        message: 'Member added to household successfully.',
        data: {
            household: finalHousehold,
            profile: finalHousehold.memberProfiles.find((p) => p.familyMemberId.equals(familyMemberId)),
        },
    });
});
/**
 * @desc    Update a member's profile within a household
 * @route   PATCH /api/households/:householdId/members/:memberProfileId
 * @access  Private (Parent only)
 */
exports.updateMemberProfile = (0, express_async_handler_1.default)(async (req, res) => {
    const { householdId, memberProfileId } = req.params;
    const { displayName, profileColor, role, focusedTaskId } = req.body;
    const loggedInUserId = req.user?._id;
    if (!loggedInUserId) {
        throw new AppError_1.default('Authentication error. User not found.', 401);
    }
    const household = await Household_1.default.findById(householdId);
    if (!household) {
        throw new AppError_1.default('Household not found.', 404);
    }
    const isParent = household.memberProfiles.some((member) => member.familyMemberId.equals(loggedInUserId) &&
        member.role === 'Parent');
    if (!isParent) {
        throw new AppError_1.default('Unauthorized. Only parents of this household can update members.', 403);
    }
    const memberProfile = household.memberProfiles.find((member) => member._id.equals(memberProfileId));
    if (!memberProfile) {
        throw new AppError_1.default('Member profile not found in this household.', 404);
    }
    if (displayName)
        memberProfile.displayName = displayName;
    if (profileColor)
        memberProfile.profileColor = profileColor;
    if (role)
        memberProfile.role = role;
    if (focusedTaskId !== undefined)
        memberProfile.focusedTaskId = focusedTaskId;
    await household.save();
    // Emit real-time update
    server_1.io.emit('household_updated', { type: 'member_update', householdId, memberProfile });
    res.status(200).json(household);
});
/**
 * @desc    Remove a member from a household
 * @route   DELETE /api/households/:householdId/members/:memberProfileId
 * @access  Private (Parent only)
 */
exports.removeMemberFromHousehold = (0, express_async_handler_1.default)(async (req, res) => {
    const { householdId, memberProfileId } = req.params;
    const loggedInUserId = req.user?._id;
    if (!loggedInUserId) {
        throw new AppError_1.default('Authentication error. User not found.', 401);
    }
    const household = await Household_1.default.findById(householdId);
    if (!household) {
        throw new AppError_1.default('Household not found.', 404);
    }
    const isParent = household.memberProfiles.some((member) => member.familyMemberId.equals(loggedInUserId) &&
        member.role === 'Parent');
    if (!isParent) {
        throw new AppError_1.default('Unauthorized. Only parents of this household can remove members.', 403);
    }
    const memberToRemove = household.memberProfiles.find((member) => member._id.equals(memberProfileId));
    if (!memberToRemove) {
        throw new AppError_1.default('Member profile not found in this household.', 404);
    }
    if (memberToRemove.role === 'Parent') {
        const parentCount = household.memberProfiles.filter((m) => m.role === 'Parent').length;
        if (parentCount <= 1) {
            throw new AppError_1.default('Cannot remove the last parent from a household.', 400);
        }
    }
    // CLEANUP: If this is a linked child, clean up the link data
    if (memberToRemove.isLinkedChild && memberToRemove.role === 'Child') {
        const HouseholdLink = (await Promise.resolve().then(() => __importStar(require('../models/HouseholdLink')))).default;
        // Find and delete the household link
        const link = await HouseholdLink.findOne({
            childId: memberToRemove.familyMemberId,
            $or: [
                { household1: householdId },
                { household2: householdId },
            ],
        });
        if (link) {
            // Determine which is the other household
            const otherHouseholdId = link.household1.toString() === householdId.toString()
                ? link.household2
                : link.household1;
            // Update the other household to check if child should still be marked as linked
            const otherHousehold = await Household_1.default.findById(otherHouseholdId);
            if (otherHousehold) {
                const otherChildProfile = otherHousehold.memberProfiles.find((p) => p.familyMemberId.toString() === memberToRemove.familyMemberId.toString());
                if (otherChildProfile) {
                    // Check if there are any other links for this child
                    const otherLinks = await HouseholdLink.find({
                        childId: memberToRemove.familyMemberId,
                        _id: { $ne: link._id },
                    });
                    // If no other links exist, mark as not linked
                    if (otherLinks.length === 0) {
                        otherChildProfile.isLinkedChild = false;
                        await otherHousehold.save();
                    }
                }
            }
            // Delete the link
            await HouseholdLink.findByIdAndDelete(link._id);
            // Update the child's linkedHouseholds array
            const child = await FamilyMember_1.default.findById(memberToRemove.familyMemberId);
            if (child && child.linkedHouseholds) {
                child.linkedHouseholds = child.linkedHouseholds.filter((lh) => lh.householdId.toString() !== householdId.toString());
                await child.save();
            }
        }
    }
    household.memberProfiles = household.memberProfiles.filter((member) => !member._id.equals(memberProfileId));
    await household.save();
    // Emit real-time update
    server_1.io.emit('household_updated', { type: 'member_remove', householdId, memberProfileId });
    res.status(200).json(household);
});
// --- INVITE SYSTEM ---
const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};
/**
 * @desc    Get (or create) the invite code for a household
 * @route   GET /api/households/:id/invite-code
 * @access  Private (Parent only)
 */
exports.getInviteCode = (0, express_async_handler_1.default)(async (req, res) => {
    const { id } = req.params;
    const userId = req.user?._id;
    const household = await Household_1.default.findById(id);
    if (!household)
        throw new AppError_1.default('Household not found', 404);
    const isParent = household.memberProfiles.some((p) => p.familyMemberId.toString() === userId.toString() && p.role === 'Parent');
    if (!isParent)
        throw new AppError_1.default('Unauthorized', 403);
    if (!household.inviteCode) {
        household.inviteCode = generateCode();
        await household.save();
    }
    res.status(200).json({ inviteCode: household.inviteCode });
});
/**
 * @desc    Regenerate a new invite code
 * @route   POST /api/households/:id/invite-code
 * @access  Private (Parent only)
 */
exports.regenerateInviteCode = (0, express_async_handler_1.default)(async (req, res) => {
    const { id } = req.params;
    const userId = req.user?._id;
    const household = await Household_1.default.findById(id);
    if (!household)
        throw new AppError_1.default('Household not found', 404);
    const isParent = household.memberProfiles.some((p) => p.familyMemberId.toString() === userId.toString() && p.role === 'Parent');
    if (!isParent)
        throw new AppError_1.default('Unauthorized', 403);
    household.inviteCode = generateCode();
    await household.save();
    res.status(200).json({ inviteCode: household.inviteCode });
});
/**
 * @desc    Join a household using an invite code
 * @route   POST /api/households/join
 * @access  Private (Any authenticated user)
 */
exports.joinHousehold = (0, express_async_handler_1.default)(async (req, res) => {
    const { inviteCode } = req.body;
    const userId = req.user?._id;
    const user = req.user;
    if (!inviteCode)
        throw new AppError_1.default('Invite code is required', 400);
    const household = await Household_1.default.findOne({ inviteCode: inviteCode.toUpperCase() });
    if (!household)
        throw new AppError_1.default('Invalid invite code', 404);
    const isMember = household.memberProfiles.some((p) => p.familyMemberId.toString() === userId.toString());
    if (isMember)
        throw new AppError_1.default('You are already a member of this household', 400);
    const newProfile = {
        familyMemberId: userId,
        displayName: user?.firstName || 'New Member',
        profileColor: '#3B82F6',
        role: 'Parent',
        pointsTotal: 0
    };
    household.memberProfiles.push(newProfile);
    await household.save();
    res.status(200).json({
        status: 'success',
        message: 'Joined household successfully',
        householdId: household._id
    });
});
//# sourceMappingURL=householdController.js.map