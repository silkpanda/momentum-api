// src/controllers/householdController.ts
import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import mongoose, { Types } from 'mongoose'; // Import mongoose for CastError check
import Household, { IHouseholdMemberProfile } from '../models/Household';
import FamilyMember from '../models/FamilyMember';
import Task from '../models/Task'; // Required for cleanup
import StoreItem from '../models/StoreItem'; // Required for cleanup
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import AppError from '../utils/AppError';
import { io } from '../server'; // Import Socket.io instance
import { createMemberCalendar, updateGoogleCalendarColor } from '../services/googleCalendarService';

/**
 * @desc    Create a new household
 * @route   POST /api/households
 * @access  Private
 */
export const createHousehold = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { householdName, userDisplayName, userProfileColor } = req.body;

    const creatorFamilyMemberId = req.user?._id as Types.ObjectId;

    if (!creatorFamilyMemberId) {
      throw new AppError('Authentication error. User not found.', 401);
    }

    if (!householdName || !userDisplayName || !userProfileColor) {
      throw new AppError(
        'Missing required fields: householdName, userDisplayName, and userProfileColor are all required.',
        400,
      );
    }

    const creatorProfile: IHouseholdMemberProfile = {
      familyMemberId: creatorFamilyMemberId,
      displayName: userDisplayName,
      profileColor: userProfileColor,
      role: 'Parent',
      pointsTotal: 0,
    };

    const household = await Household.create({
      householdName,
      memberProfiles: [creatorProfile],
    });

    res.status(201).json(household);
  },
);

/**
 * @desc    Get the primary household for the current user's session context
 * @route   GET /api/households
 * @access  Private
 */
export const getMyHouseholds = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { householdId } = req;

    if (!householdId) {
      throw new AppError('Household context not found in session token.', 401);
    }

    const household = await Household.findById(householdId).populate({
      path: 'memberProfiles.familyMemberId',
      select: 'firstName email linkedHouseholds',
    });

    if (!household) {
      throw new AppError('Primary household not found.', 404);
    }

    res.status(200).json({
      status: 'success',
      data: household,
    });
  },
);

/**
 * @desc    Get a single household by ID
 * @route   GET /api/households/:id
 * @access  Private
 */
export const getHousehold = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const userId = req.user?._id as Types.ObjectId;
    if (!userId) {
      throw new AppError('Authentication error. User not found.', 401);
    }

    // Fetch and populate (transforms familyMemberId into an Object)
    const household = await Household.findById(id).populate({
      path: 'memberProfiles.familyMemberId',
      select: 'firstName email linkedHouseholds',
    });

    if (!household) {
      throw new AppError('Household not found.', 404);
    }

    // FIX: Handle the populated object correctly
    const isMember = household.memberProfiles.some((p) => {
      // Because we populated, familyMemberId is now an object (IFamilyMember)
      // We cast to 'any' to access _id safely without TS complaining about the union type
      const memberDoc = p.familyMemberId as any;

      // Check if it has an _id (populated) or is just an ID (unpopulated fallback)
      const memberId = memberDoc._id || memberDoc;

      return memberId.toString() === userId.toString();
    });

    if (!isMember) {
      throw new AppError('You are not a member of this household.', 403);
    }

    res.status(200).json({
      status: 'success',
      data: household,
    });
  },
);

/**
 * @desc    Update a household (e.g., rename)
 * @route   PATCH /api/households/:id
 * @access  Private (Parent only)
 */
export const updateHousehold = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { householdName } = req.body;

    const userId = req.user?._id as Types.ObjectId;
    if (!userId) {
      throw new AppError('Authentication error. User not found.', 401);
    }

    if (!householdName) {
      throw new AppError('householdName is required for update.', 400);
    }

    // Note: No populate here, so familyMemberId remains an ObjectId
    const household = await Household.findById(id);

    if (!household) {
      throw new AppError('Household not found.', 404);
    }

    // Authorization: Only a Parent of THIS household can update it
    const memberProfile = household.memberProfiles.find(
      (p) => p.familyMemberId.toString() === userId.toString()
    );

    if (!memberProfile || memberProfile.role !== 'Parent') {
      throw new AppError('Unauthorized. Only Parents can update household details.', 403);
    }

    household.householdName = householdName;
    await household.save();

    // Emit real-time update
    io.emit('household_updated', { type: 'update', householdId: id, householdName });

    res.status(200).json({
      status: 'success',
      data: household,
    });
  },
);

/**
 * @desc    Delete a household
 * @route   DELETE /api/households/:id
 * @access  Private (Parent only)
 */
export const deleteHousehold = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const userId = req.user?._id as Types.ObjectId;
    if (!userId) {
      throw new AppError('Authentication error. User not found.', 401);
    }

    const household = await Household.findById(id);

    if (!household) {
      throw new AppError('Household not found.', 404);
    }

    // Authorization: Only a Parent of THIS household can delete it
    const memberProfile = household.memberProfiles.find(
      (p) => p.familyMemberId.toString() === userId.toString()
    );

    if (!memberProfile || memberProfile.role !== 'Parent') {
      throw new AppError('Unauthorized. Only Parents can delete a household.', 403);
    }

    // Cascade Delete: Clean up related data
    await Task.deleteMany({ householdRefId: id });
    await StoreItem.deleteMany({ householdRefId: id });

    await Household.findByIdAndDelete(id);

    res.status(204).json({
      status: 'success',
      data: null,
    });
  },
);

/**
 * @desc    Add a new member to a household
 * @route   POST /api/households/:householdId/members
 * @access  Private (Parent only)
 */
export const addMemberToHousehold = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { householdId } = req.params;
    let { familyMemberId, firstName, displayName, profileColor, role, calendarOption } = req.body;

    const loggedInUserId = req.user?._id as Types.ObjectId;

    if (!loggedInUserId) {
      throw new AppError('Authentication error. User not found.', 401);
    }

    if (!displayName || !profileColor || !role) {
      if (!familyMemberId && (!firstName || !role)) {
        throw new AppError(
          'Missing required fields: displayName, profileColor, and role are required. For new members, firstName is also required.',
          400,
        );
      }
    }

    if (!familyMemberId) {
      // Allow creating both Child AND Parent roles without an existing profile
      // This supports the flow where a parent adds a co-parent or another child profile

      const emailPrefix = firstName.toLowerCase().replace(/\s/g, '');
      const roleSuffix = role.toLowerCase();

      const newMember = await FamilyMember.create({
        firstName,
        lastName: 'Household',
        email: `${emailPrefix}-${roleSuffix}-${new Date().getTime()}@momentum.com`,
        password: `temp-${Math.random()}`,
        onboardingCompleted: false,
        pinSetupCompleted: false,
      });

      familyMemberId = newMember._id;
    }

    const household = await Household.findById(householdId);

    if (!household) {
      throw new AppError('Household not found.', 404);
    }

    const isParent = household.memberProfiles.some(
      (member) =>
        member.familyMemberId.equals(loggedInUserId) &&
        member.role === 'Parent',
    );

    if (!isParent) {
      throw new AppError(
        'Unauthorized. Only parents of this household can add new members.',
        403,
      );
    }

    const isAlreadyMember = household.memberProfiles.some((member) =>
      member.familyMemberId.equals(familyMemberId),
    );

    if (isAlreadyMember) {
      throw new AppError(
        'This family member is already in the household.',
        400,
      );
    }

    const memberExists = await FamilyMember.findById(familyMemberId);
    if (!memberExists) {
      throw new AppError('No family member found with the provided ID.', 404);
    }

    const newMemberProfile: IHouseholdMemberProfile = {
      familyMemberId: new Types.ObjectId(familyMemberId),
      displayName: displayName || memberExists.firstName,
      profileColor: profileColor!,
      role: role as 'Parent' | 'Child',
      pointsTotal: 0,
    };

    household.memberProfiles.push(newMemberProfile);
    const updatedHousehold = await household.save();

    const finalHousehold = await updatedHousehold.populate({
      path: 'memberProfiles.familyMemberId',
      select: 'firstName email linkedHouseholds',
    });

    // Emit real-time update
    io.emit('household_updated', { type: 'member_add', householdId, member: finalHousehold.memberProfiles.find((p) => p.familyMemberId.equals(familyMemberId)) });

    // Handle Calendar Integration
    if (calendarOption && loggedInUserId) {
      try {
        // Fetch logged-in user to get their Google Tokens
        const loggedInUser = await FamilyMember.findById(loggedInUserId).select('+googleCalendar');

        if (loggedInUser?.googleCalendar?.accessToken) {
          const memberToUpdate = await FamilyMember.findById(familyMemberId);

          if (memberToUpdate) {
            let calendarId: string | undefined;

            // FamilyMember document doesn't have displayName/profileColor (stored in Household)
            // We use the values provided in the request or fallback to firstName/default
            const nameForCalendar = displayName || firstName || memberToUpdate.firstName || 'Member';
            const colorForCalendar = profileColor || '#3B82F6';

            if (calendarOption.type === 'create') {
              calendarId = await createMemberCalendar(
                nameForCalendar,
                colorForCalendar,
                loggedInUser.googleCalendar.accessToken,
                loggedInUser.googleCalendar.refreshToken
              );
            } else if (calendarOption.type === 'sync' && calendarOption.calendarId) {
              calendarId = calendarOption.calendarId as string;
              await updateGoogleCalendarColor(
                calendarId,
                colorForCalendar,
                loggedInUser.googleCalendar.accessToken,
                loggedInUser.googleCalendar.refreshToken
              );
            }

            if (calendarId) {
              if (!memberToUpdate.googleCalendar) {
                memberToUpdate.googleCalendar = {
                  accessToken: '',
                  refreshToken: '',
                  expiryDate: 0
                };
              }
              memberToUpdate.googleCalendar.selectedCalendarId = calendarId;
              await memberToUpdate.save();
            }
          }
        }
      } catch (error) {
        console.error('Failed to setup calendar for new member:', error);
        // Don't fail the request, just log error
      }
    }

    res.status(201).json({
      status: 'success',
      message: 'Member added to household successfully.',
      data: {
        household: finalHousehold,
        profile: finalHousehold.memberProfiles.find((p) =>
          p.familyMemberId.equals(familyMemberId),
        ),
      },
    });
  },
);

/**
 * @desc    Update a member's profile within a household
 * @route   PATCH /api/households/:householdId/members/:memberProfileId
 * @access  Private (Parent only)
 */
export const updateMemberProfile = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { householdId, memberProfileId } = req.params;
    const { displayName, profileColor, role, focusedTaskId } = req.body;

    const loggedInUserId = req.user?._id as Types.ObjectId;

    if (!loggedInUserId) {
      throw new AppError('Authentication error. User not found.', 401);
    }

    const household = await Household.findById(householdId);

    if (!household) {
      throw new AppError('Household not found.', 404);
    }

    const isParent = household.memberProfiles.some(
      (member) =>
        member.familyMemberId.equals(loggedInUserId) &&
        member.role === 'Parent',
    );

    if (!isParent) {
      throw new AppError(
        'Unauthorized. Only parents of this household can update members.',
        403,
      );
    }

    const memberProfile = household.memberProfiles.find((member) =>
      member._id!.equals(memberProfileId),
    );

    if (!memberProfile) {
      throw new AppError('Member profile not found in this household.', 404);
    }

    if (displayName) memberProfile.displayName = displayName;
    if (profileColor) memberProfile.profileColor = profileColor;
    if (role) memberProfile.role = role;
    if (focusedTaskId !== undefined) memberProfile.focusedTaskId = focusedTaskId;

    await household.save();

    // Emit real-time update
    io.emit('household_updated', { type: 'member_update', householdId, memberProfile });

    res.status(200).json(household);
  },
);

/**
 * @desc    Remove a member from a household
 * @route   DELETE /api/households/:householdId/members/:memberProfileId
 * @access  Private (Parent only)
 */
export const removeMemberFromHousehold = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { householdId, memberProfileId } = req.params;

    const loggedInUserId = req.user?._id as Types.ObjectId;

    if (!loggedInUserId) {
      throw new AppError('Authentication error. User not found.', 401);
    }

    const household = await Household.findById(householdId);

    if (!household) {
      throw new AppError('Household not found.', 404);
    }

    const isParent = household.memberProfiles.some(
      (member) =>
        member.familyMemberId.equals(loggedInUserId) &&
        member.role === 'Parent',
    );

    if (!isParent) {
      throw new AppError(
        'Unauthorized. Only parents of this household can remove members.',
        403,
      );
    }

    const memberToRemove = household.memberProfiles.find((member) =>
      member._id!.equals(memberProfileId),
    );

    if (!memberToRemove) {
      throw new AppError('Member profile not found in this household.', 404);
    }

    if (memberToRemove.role === 'Parent') {
      const parentCount = household.memberProfiles.filter(
        (m) => m.role === 'Parent',
      ).length;
      if (parentCount <= 1) {
        throw new AppError(
          'Cannot remove the last parent from a household.',
          400,
        );
      }
    }

    // CLEANUP: If this is a linked child, clean up the link data
    if (memberToRemove.isLinkedChild && memberToRemove.role === 'Child') {
      const HouseholdLink = (await import('../models/HouseholdLink')).default;

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
        const otherHousehold = await Household.findById(otherHouseholdId);
        if (otherHousehold) {
          const otherChildProfile = otherHousehold.memberProfiles.find(
            (p) => p.familyMemberId.toString() === memberToRemove.familyMemberId.toString()
          );

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
        const child = await FamilyMember.findById(memberToRemove.familyMemberId);
        if (child && child.linkedHouseholds) {
          child.linkedHouseholds = child.linkedHouseholds.filter(
            (lh: any) => lh.householdId.toString() !== householdId.toString()
          );
          await child.save();
        }
      }
    }

    household.memberProfiles = household.memberProfiles.filter(
      (member) => !member._id!.equals(memberProfileId),
    );

    await household.save();

    // Emit real-time update
    io.emit('household_updated', { type: 'member_remove', householdId, memberProfileId });

    res.status(200).json(household);
  },
);

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
export const getInviteCode = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user?._id as Types.ObjectId;

    const household = await Household.findById(id);
    if (!household) throw new AppError('Household not found', 404);

    const isParent = household.memberProfiles.some(
      (p) => p.familyMemberId.toString() === userId.toString() && p.role === 'Parent'
    );
    if (!isParent) throw new AppError('Unauthorized', 403);

    if (!household.inviteCode) {
      household.inviteCode = generateCode();
      await household.save();
    }

    res.status(200).json({ inviteCode: household.inviteCode });
  }
);

/**
 * @desc    Regenerate a new invite code
 * @route   POST /api/households/:id/invite-code
 * @access  Private (Parent only)
 */
export const regenerateInviteCode = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user?._id as Types.ObjectId;

    const household = await Household.findById(id);
    if (!household) throw new AppError('Household not found', 404);

    const isParent = household.memberProfiles.some(
      (p) => p.familyMemberId.toString() === userId.toString() && p.role === 'Parent'
    );
    if (!isParent) throw new AppError('Unauthorized', 403);

    household.inviteCode = generateCode();
    await household.save();

    res.status(200).json({ inviteCode: household.inviteCode });
  }
);

/**
 * @desc    Join a household using an invite code
 * @route   POST /api/households/join
 * @access  Private (Any authenticated user)
 */
export const joinHousehold = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { inviteCode } = req.body;
    const userId = req.user?._id as Types.ObjectId;
    const { user } = req;

    if (!inviteCode) throw new AppError('Invite code is required', 400);

    const household = await Household.findOne({ inviteCode: inviteCode.toUpperCase() });
    if (!household) throw new AppError('Invalid invite code', 404);

    const isMember = household.memberProfiles.some(
      (p) => p.familyMemberId.toString() === userId.toString()
    );
    if (isMember) throw new AppError('You are already a member of this household', 400);

    const newProfile: IHouseholdMemberProfile = {
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
  }
);
