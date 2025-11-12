// src/controllers/householdController.ts
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
 * @desc    Get all households the current user is a member of
 * @route   GET /api/households
 * @access  Private
 */
export const getMyHouseholds = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    // FIX: Assert the type of _id to Types.ObjectId
    const familyMemberId = req.user?._id as Types.ObjectId; 

    if (!familyMemberId) {
      throw new AppError('Authentication error. User not found.', 401);
    }

    // The query now safely uses the Types.ObjectId
    const households = await Household.find({
      'memberProfiles.familyMemberId': familyMemberId,
    });

    res.status(200).json(households);
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
    const { familyMemberId, displayName, profileColor, role } = req.body;
    
    // FIX: Assert the type of _id to Types.ObjectId
    const loggedInUserId = req.user?._id as Types.ObjectId; 

    if (!loggedInUserId) {
        throw new AppError('Authentication error. User not found.', 401);
    }


    if (!familyMemberId || !displayName || !profileColor || !role) {
      throw new AppError(
        'Missing required fields: familyMemberId, displayName, profileColor, and role are required.',
        400,
      );
    }

    const household = await Household.findById(householdId);

    if (!household) {
      throw new AppError('Household not found.', 404);
    }

    // SECURITY CHECK: Ensure the logged-in user is a 'Parent' in this household
    const isParent = household.memberProfiles.some(
      // The comparison now safely uses the Types.ObjectId
      (member) =>
        member.familyMemberId.equals(loggedInUserId) && member.role === 'Parent',
    );

    if (!isParent) {
      throw new AppError(
        'Unauthorized. Only parents of this household can add new members.',
        403,
      );
    }

    // Check if the user we are trying to add is already in this household
    const isAlreadyMember = household.memberProfiles.some((member) =>
      member.familyMemberId.equals(familyMemberId),
    );

    if (isAlreadyMember) {
      throw new AppError(
        'This family member is already in the household.',
        400,
      );
    }

    // Check if the familyMemberId is a valid user
    const memberExists = await FamilyMember.findById(familyMemberId);
    if (!memberExists) {
      throw new AppError('No family member found with the provided ID.', 404);
    }

    // Create the new member profile sub-document
    const newMemberProfile: IHouseholdMemberProfile = {
      familyMemberId: new Types.ObjectId(familyMemberId), 
      displayName,
      profileColor,
      role,
      pointsTotal: 0,
    };

    // Add to the array and save
    household.memberProfiles.push(newMemberProfile);
    await household.save();

    res.status(201).json(household);
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
    
    // FIX: Assert the type of _id to Types.ObjectId
    const loggedInUserId = req.user?._id as Types.ObjectId; 

    if (!loggedInUserId) {
        throw new AppError('Authentication error. User not found.', 401);
    }

    const household = await Household.findById(householdId);

    if (!household) {
      throw new AppError('Household not found.', 404);
    }

    // SECURITY CHECK: Ensure the logged-in user is a 'Parent' in this household
    const isParent = household.memberProfiles.some(
      // The comparison now safely uses the Types.ObjectId
      (member) =>
        member.familyMemberId.equals(loggedInUserId) && member.role === 'Parent',
    );

    if (!isParent) {
      throw new AppError(
        'Unauthorized. Only parents of this household can update members.',
        403,
      );
    }

    // Find the specific member profile sub-document by its unique _id
    const memberProfile = household.memberProfiles.find(
      (member) => member._id!.equals(memberProfileId),
    );

    if (!memberProfile) {
      throw new AppError('Member profile not found in this household.', 404);
    }

    // Update the fields
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
    
    // FIX: Assert the type of _id to Types.ObjectId
    const loggedInUserId = req.user?._id as Types.ObjectId; 

    if (!loggedInUserId) {
        throw new AppError('Authentication error. User not found.', 401);
    }

    const household = await Household.findById(householdId);

    if (!household) {
      throw new AppError('Household not found.', 404);
    }

    // SECURITY CHECK: Ensure the logged-in user is a 'Parent' in this household
    const isParent = household.memberProfiles.some(
      // The comparison now safely uses the Types.ObjectId
      (member) =>
        member.familyMemberId.equals(loggedInUserId) && member.role === 'Parent',
    );

    if (!isParent) {
      throw new AppError(
        'Unauthorized. Only parents of this household can remove members.',
        403,
      );
    }
    
    // Find the member profile to be removed
    const memberToRemove = household.memberProfiles.find(
      (member) => member._id!.equals(memberProfileId)
    );

    if (!memberToRemove) {
      throw new AppError('Member profile not found in this household.', 404);
    }
    
    // PREVENT DELETION: Cannot remove the last parent
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

    // Pull the sub-document from the array
    household.memberProfiles = household.memberProfiles.filter(
      (member) => !member._id!.equals(memberProfileId)
    );

    await household.save();

    res.status(200).json(household);
  },
);