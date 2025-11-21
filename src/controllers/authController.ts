// src/controllers/authController.ts
import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { Types } from 'mongoose';
import FamilyMember from '../models/FamilyMember';
import Household, { IHouseholdMemberProfile } from '../models/Household'; // Import IHouseholdMemberProfile
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/constants';
import { IFamilyMember } from '../models/FamilyMember';
import { AuthenticatedRequest } from '../middleware/authMiddleware'; // FIX: Use AuthenticatedRequest
import AppError from '../utils/appError';
import asyncHandler from 'express-async-handler'; // NEW IMPORT for restrictTo

// Helper function to generate a JWT (used by both signup and login)
const signToken = (id: string, householdId: string): string => {
  // Payload contains the user ID and their *current context* household ID
  const payload = { id, householdId };

  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN as any,
  };

  return jwt.sign(payload, JWT_SECRET, options);
};

// -----------------------------------------------------------------------------
// 1. Authentication Controllers (Login/Signup)
// -----------------------------------------------------------------------------

/**
 * Controller function to handle Parent Sign-Up (Phase 2.1)
 * Adheres to the new Unified Membership Model (v3)
 */
export const signup = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { firstName, lastName, email, password } = req.body;
  const { householdName, userDisplayName, userProfileColor } = req.body; // New fields for v3

  if (!firstName || !lastName || !email || !password || !householdName || !userDisplayName || !userProfileColor) {
    return next(new AppError('Missing mandatory fields for signup and initial household profile (firstName, lastName, email, password, householdName, userDisplayName, userProfileColor).', 400));
  }

  try {
    // 1. Create the Parent FamilyMember document (global identity)
    const newParent = await FamilyMember.create({
      firstName,
      lastName,
      email,
      password, // Hashed by the 'pre-save' hook
    });

    const parentId: Types.ObjectId = newParent._id as Types.ObjectId;

    // 2. Create the initial Parent Profile sub-document for the Household
    const creatorProfile: IHouseholdMemberProfile = {
      familyMemberId: parentId,
      displayName: userDisplayName,
      profileColor: userProfileColor,
      role: 'Parent', // The creator is always a Parent
      pointsTotal: 0,
    };

    // 3. Create the initial Household, linking the parent's profile
    const newHousehold = await Household.create({
      householdName,
      memberProfiles: [creatorProfile], //
    });

    const householdId: Types.ObjectId = newHousehold._id as Types.ObjectId;

    // 4. Generate and return JWT
    const token = signToken(parentId.toString(), householdId.toString());

    res.status(201).json({
      status: 'success',
      token,
      data: {
        parent: newParent,
        household: newHousehold,
      },
    });

  } catch (err: any) {
    // Handle duplicate key error (email already exists)
    if (err.code === 11000) {
      return next(new AppError('This email address is already registered.', 409));
    }
    return next(new AppError(`Failed to create user or household: ${err.message}`, 500));
  }
});

/**
 * Controller function to handle Parent Login (Phase 2.1)
 * Adheres to the new Unified Membership Model (v3)
 */
export const login = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Please provide email and password.', 400));
  }

  // 1. Find user by email and explicitly select the password field
  const familyMember = await FamilyMember.findOne({ email }).select('+password');

  // 2. Check if user exists and password is correct
  const isPasswordCorrect =
    familyMember && (await familyMember.comparePassword(password));

  if (!isPasswordCorrect) {
    return next(new AppError('Incorrect email or password.', 401));
  }

  // 3. CRITICAL: Find a Household where this FamilyMember is a 'Parent'
  const parentId: Types.ObjectId = familyMember._id as Types.ObjectId;

  const household = await Household.findOne({
    'memberProfiles.familyMemberId': parentId,
    'memberProfiles.role': 'Parent', //
  });

  if (!household) {
    return next(new AppError('User does not belong to any household as a Parent.', 401));
  }

  // FIX: Explicitly cast _id to resolve 'unknown' type
  const primaryHouseholdId: Types.ObjectId = household._id as Types.ObjectId;

  // 4. Generate JWT
  const token = signToken(
    parentId.toString(),
    primaryHouseholdId.toString()
  );

  res.status(200).json({
    status: 'success',
    token,
    data: {
      parent: familyMember,
      primaryHouseholdId,
    },
  });
});

// -----------------------------------------------------------------------------
// 2. Authorization Middleware (Restrict by Role)
// -----------------------------------------------------------------------------

/**
 * Factory function that returns the actual middleware.
 * This MUST run *after* the 'protect' middleware.
 */
export const restrictTo = (...roles: Array<'Parent' | 'Child'>) => {
  return asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {

    // 1. Check if user and householdId are attached by 'protect' middleware
    if (!req.user || !req.householdId) {
      return next(
        new AppError(
          'Role check failed: Missing user or household context from token.',
          401,
        ),
      );
    }

    // 2. Fetch the household from the database using the ID from the token
    const currentHousehold = await Household.findById(req.householdId);

    if (!currentHousehold) {
      return next(
        new AppError(
          'Role check failed: The household associated with your token no longer exists.',
          401,
        ),
      );
    }

    // 3. Find the user's profile *within* that household
    // FIX APPLIED HERE: Cast req.user!._id to Types.ObjectId
    const userHouseholdProfile = currentHousehold.memberProfiles.find(
      (member) => member.familyMemberId.equals(req.user!._id as Types.ObjectId)
    );

    // 4. Check if the profile exists and their role is allowed
    if (!userHouseholdProfile || !roles.includes(userHouseholdProfile.role)) {
      return next(
        new AppError(
          'You do not have permission to perform this action in this household.',
          403,
        ),
      );
    }

    // 5. User has the correct role, grant access
    next();
  });
};

/**
 * Protected route for testing
 */
export const getMe = (req: AuthenticatedRequest, res: Response): void => {
  res.status(200).json({
    status: 'success',
    data: {
      user: req.user,
      householdId: req.householdId, // This is the context ID from the JWT
    },
  });
};