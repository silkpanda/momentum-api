// silkpanda/momentum-api/momentum-api-234e21f44dd55f086a321bc9901934f98b747c7a/src/controllers/householdController.ts
import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import Household, { IHouseholdMemberProfile } from '../models/Household';
import FamilyMember from '../models/FamilyMember';
import { AuthenticatedRequest } from '../middleware/authMiddleware'; 
import AppError from '../utils/AppError'; 
import { Types } from 'mongoose';

/**
 * @desc    Create a new household
 * @route   POST /api/households
 * @access  Private
 */
export const createHousehold = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { householdName, userDisplayName, userProfileColor } = req.body;

    // FIX: Assert the type of _id to Types.ObjectId
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

    // Create the profile for the creator
    const creatorProfile: IHouseholdMemberProfile = {
      familyMemberId: creatorFamilyMemberId, // Now correctly typed
      displayName: userDisplayName,
      profileColor: userProfileColor,
      role: 'Parent', // The creator is always a Parent
      pointsTotal: 0,
    };

    // Create the new household document
    const household = await Household.create({
      householdName,
      memberProfiles: [creatorProfile], 
    });

    res.status(201).json(household);
  },
);

/**
 * @desc    Get the primary household for the current user's session context (from JWT)
 * @route   GET /api/households
 * @access  Private
 */
export const getMyHouseholds = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    // CRITICAL FIX: Use the householdId from the JWT payload for the session context
    const householdId = req.householdId; 

    if (!householdId) {
      throw new AppError('Household context not found in session token.', 401);
    }

    // 1. Find the single household using the ID from the token
    const household = await Household.findById(householdId)
      // Populate the nested memberProfiles.familyMemberId to get user details
      .populate({
        path: 'memberProfiles.familyMemberId',
        select: 'firstName email', // Only select necessary fields
      });

    if (!household) {
      throw new AppError('Primary household not found.', 404);
    }

    //
    // --- THIS IS THE CRITICAL CHANGE ---
    // We are no longer "double wrapping" the household object.
    // The mobile app's fetcher expects the household data directly.
    //
    res.status(200).json({
      status: 'success',
      data: household, // <-- WAS: { household: household }
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
    let { familyMemberId, firstName, displayName, profileColor, role } = req.body;
    
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
        if (role !== 'Child') {
            throw new AppError('Only the "Child" role can be created through this endpoint without a familyMemberId.', 400);
        }
        
        const newChild = await FamilyMember.create({
            firstName,
            lastName: 'Household', 
            email: `${firstName.toLowerCase().replace(/\s/g, '')}-child-${new Date().getTime()}@momentum.com`, 
            password: `temp-${Math.random()}`, 
        });

        familyMemberId = newChild._id;
    }

    const household = await Household.findById(householdId);

    if (!household) {
      throw new AppError('Household not found.', 404);
    }

    const isParent = household.memberProfiles.some(
      (member) =>
        member.familyMemberId.equals(loggedInUserId) && member.role === 'Parent',
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
        select: 'firstName email',
    });

    res.status(201).json({
        status: 'success',
        message: 'Member added to household successfully.',
        data: {
            household: finalHousehold,
            profile: finalHousehold.memberProfiles.find(
                p => p.familyMemberId.equals(familyMemberId)
            )
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
    const { displayName, profileColor, role } = req.body;
    
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
        member.familyMemberId.equals(loggedInUserId) && member.role === 'Parent',
    );

    if (!isParent) {
      throw new AppError(
        'Unauthorized. Only parents of this household can update members.',
        403,
      );
    }

    const memberProfile = household.memberProfiles.find(
      (member) => member._id!.equals(memberProfileId),
    );

    if (!memberProfile) {
      throw new AppError('Member profile not found in this household.', 404);
    }

    if (displayName) memberProfile.displayName = displayName;
    if (profileColor) memberProfile.profileColor = profileColor;
    if (role) memberProfile.role = role;

    await household.save();

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
        member.familyMemberId.equals(loggedInUserId) && member.role === 'Parent',
    );

    if (!isParent) {
      throw new AppError(
        'Unauthorized. Only parents of this household can remove members.',
        403,
      );
    }
    
    const memberToRemove = household.memberProfiles.find(
      (member) => member._id!.equals(memberProfileId)
    );

    if (!memberToRemove) {
      throw new AppError('Member profile not found in this household.', 404);
    }
    
    if (memberToRemove.role === 'Parent') {
      const parentCount = household.memberProfiles.filter(
        (m) => m.role === 'Parent'
      ).length;
      if (parentCount <= 1) {
        throw new AppError(
          'Cannot remove the last parent from a household.',
          400,
        );
      }
    }

    household.memberProfiles = household.memberProfiles.filter(
      (member) => !member._id!.equals(memberProfileId)
    );

    await household.save();

    res.status(200).json(household);
  },
);