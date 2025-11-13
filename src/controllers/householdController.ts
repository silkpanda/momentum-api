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

    // 2. Return success with the single household document in the expected structure
    res.status(200).json({
      status: 'success',
      data: {
        household,
      },
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
    // familyMemberId will be present if adding an existing user (e.g., co-parent)
    // firstName/displayName/profileColor/role are for creating a new child
    let { familyMemberId, firstName, displayName, profileColor, role } = req.body;
    
    // FIX: Assert the type of _id to Types.ObjectId
    const loggedInUserId = req.user?._id as Types.ObjectId; 

    if (!loggedInUserId) {
        throw new AppError('Authentication error. User not found.', 401);
    }

    if (!displayName || !profileColor || !role) {
        // Only require firstName/role if creating a new member (i.e. missing familyMemberId)
        if (!familyMemberId && (!firstName || !role)) {
            throw new AppError(
                'Missing required fields: displayName, profileColor, and role are required. For new members, firstName is also required.',
                400,
            );
        }
        // If familyMemberId is present, we assume other fields are already known/not needed for this flow.
    }
    
    // --- SCENARIO A: CREATE NEW CHILD PROFILE (Implicit Add) ---
    if (!familyMemberId) {
        if (role !== 'Child') {
            throw new AppError('Only the "Child" role can be created through this endpoint without a familyMemberId.', 400);
        }
        
        // 1. Create the new FamilyMember (Child) document
        // We use a unique, placeholder email to satisfy the FamilyMember schema constraints.
        const newChild = await FamilyMember.create({
            firstName,
            lastName: 'Household', // Placeholder last name for internal uniqueness
            email: `${firstName.toLowerCase().replace(/\s/g, '')}-child-${new Date().getTime()}@momentum.com`, 
            password: `temp-${Math.random()}`, // Dummy password to satisfy model requirement for now, though it should be optional for Children.
        });

        // Use the newly created ID for the rest of the function
        familyMemberId = newChild._id;
    }
    // --- END SCENARIO A ---

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

    // Check if the resolved familyMemberId is a valid user
    const memberExists = await FamilyMember.findById(familyMemberId);
    if (!memberExists) {
      throw new AppError('No family member found with the provided ID.', 404);
    }

    // Create the new member profile sub-document
    const newMemberProfile: IHouseholdMemberProfile = {
      familyMemberId: new Types.ObjectId(familyMemberId), 
      displayName: displayName || memberExists.firstName, // Use display name from body or fallback
      profileColor: profileColor!,
      role: role as 'Parent' | 'Child',
      pointsTotal: 0,
    };

    // Add to the array and save
    household.memberProfiles.push(newMemberProfile);
    const updatedHousehold = await household.save();

    // The successful response should return the newly updated household with populated fields
    const finalHousehold = await updatedHousehold.populate({
        path: 'memberProfiles.familyMemberId',
        select: 'firstName email', // Re-fetch the saved document with population
    });

    res.status(201).json({
        status: 'success',
        message: 'Member added to household successfully.',
        data: {
            household: finalHousehold,
            // The frontend Modal expects the *new profile* to be returned, 
            // so we'll grab it from the final document.
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