// src/controllers/authController.ts
import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { Types } from 'mongoose';
import FamilyMember from '../models/FamilyMember';
import Household, { IHouseholdMemberProfile } from '../models/Household';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/constants';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import AppError from '../utils/AppError';
import asyncHandler from 'express-async-handler';

const signToken = (id: string, householdId: string): string => {
  const payload = { id, householdId };
  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN as any,
  };
  return jwt.sign(payload, JWT_SECRET, options);
};

export const signup = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { firstName, lastName, email, password } = req.body;
  const { householdName, userDisplayName, userProfileColor, inviteCode } = req.body;

  if (!firstName || !lastName || !email || !password || !userDisplayName || !userProfileColor) {
    return next(new AppError('Missing mandatory fields (firstName, lastName, email, password, userDisplayName, userProfileColor).', 400));
  }

  if (!inviteCode && !householdName) {
    return next(new AppError('householdName is required when creating a new household.', 400));
  }

  try {
    const newParent = await FamilyMember.create({
      firstName,
      lastName,
      email,
      password,
    });

    const parentId: Types.ObjectId = newParent._id as Types.ObjectId;
    let householdId: Types.ObjectId;
    let household;

    if (inviteCode) {
      household = await Household.findOne({ inviteCode: inviteCode.toUpperCase() });

      if (!household) {
        await FamilyMember.findByIdAndDelete(parentId);
        return next(new AppError('Invalid invite code.', 404));
      }

      const isMember = household.memberProfiles.some(
        (p) => p.familyMemberId.toString() === parentId.toString()
      );

      if (isMember) {
        await FamilyMember.findByIdAndDelete(parentId);
        return next(new AppError('User is already a member of this household.', 400));
      }

      const newProfile: IHouseholdMemberProfile = {
        familyMemberId: parentId,
        displayName: userDisplayName,
        profileColor: userProfileColor,
        role: 'Parent',
        pointsTotal: 0,
      };

      household.memberProfiles.push(newProfile);
      await household.save();
      householdId = household._id as Types.ObjectId;

    } else {
      const creatorProfile: IHouseholdMemberProfile = {
        familyMemberId: parentId,
        displayName: userDisplayName,
        profileColor: userProfileColor,
        role: 'Parent',
        pointsTotal: 0,
      };

      household = await Household.create({
        householdName,
        memberProfiles: [creatorProfile],
      });
      householdId = household._id as Types.ObjectId;
    }

    const token = signToken(parentId.toString(), householdId.toString());

    res.status(201).json({
      status: 'success',
      token,
      data: {
        parent: newParent,
        household: household,
      },
    });

  } catch (err: any) {
    if (err.code === 11000) {
      return next(new AppError('This email address is already registered.', 409));
    }
    return next(new AppError(`Failed to create user or household: ${err.message}`, 500));
  }
});

export const login = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Please provide email and password.', 400));
  }

  const familyMember = await FamilyMember.findOne({ email }).select('+password');
  const isPasswordCorrect = familyMember && (await familyMember.comparePassword(password));

  if (!isPasswordCorrect) {
    return next(new AppError('Incorrect email or password.', 401));
  }

  const parentId: Types.ObjectId = familyMember._id as Types.ObjectId;

  const household = await Household.findOne({
    'memberProfiles.familyMemberId': parentId,
    'memberProfiles.role': 'Parent',
  });

  if (!household) {
    return next(new AppError('User does not belong to any household as a Parent.', 401));
  }

  const primaryHouseholdId: Types.ObjectId = household._id as Types.ObjectId;
  const token = signToken(parentId.toString(), primaryHouseholdId.toString());

  res.status(200).json({
    status: 'success',
    token,
    data: {
      parent: familyMember,
      primaryHouseholdId,
    },
  });
});

export const restrictTo = (...roles: Array<'Parent' | 'Child'>) => {
  return asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !req.householdId) {
      return next(new AppError('Role check failed: Missing user or household context from token.', 401));
    }

    const currentHousehold = await Household.findById(req.householdId);
    if (!currentHousehold) {
      return next(new AppError('Role check failed: The household associated with your token no longer exists.', 401));
    }

    const userHouseholdProfile = currentHousehold.memberProfiles.find(
      (member) => member.familyMemberId.equals(req.user!._id as Types.ObjectId)
    );

    if (!userHouseholdProfile || !roles.includes(userHouseholdProfile.role)) {
      return next(new AppError('You do not have permission to perform this action in this household.', 403));
    }

    next();
  });
};

export const getMe = (req: AuthenticatedRequest, res: Response): void => {
  res.status(200).json({
    status: 'success',
    data: {
      user: req.user,
      householdId: req.householdId,
    },
  });
};