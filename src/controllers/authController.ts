// silkpanda/momentum-api/momentum-api-4bb9d40ae33d74ece3537317b858a6dec075ce78/src/controllers/authController.ts
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { Types } from 'mongoose';
import FamilyMember from '../models/FamilyMember';
import Household from '../models/Household';
import { JWT_SECRET, JWT_EXPIRES_IN, BCRYPT_SALT_ROUNDS } from '../config/constants';
import { IFamilyMember } from '../models/FamilyMember';
import { IAuthRequest } from '../middleware/authMiddleware'; // Import the extended request interface

// Helper function to generate a JWT (used by both signup and login)
const signToken = (id: string, householdRefId: string): string => {
  // Payload contains the user ID and their primary household context
  const payload = { id, householdRefId };
  
  // Options object containing the expiration time
  const options: SignOptions = { 
      // FIX APPLIED: Type cast JWT_EXPIRES_IN to 'any' to bypass TS type mismatch
      expiresIn: JWT_EXPIRES_IN as any,
  };
  
  // Use the synchronous version of sign(payload, secret, options)
  return jwt.sign(payload, JWT_SECRET, options);
};

// -----------------------------------------------------------------------------
// 1. Authentication Controllers (Login/Signup)
// -----------------------------------------------------------------------------

/**
 * Controller function to handle Parent Sign-Up (Phase 2.1)
 * ... (No change) ...
 */
export const signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { firstName, email, password } = req.body;

    if (!firstName || !email || !password) {
      res.status(400).json({ status: 'fail', message: 'Missing mandatory fields: firstName, email, and password.' });
      return;
    }

    // 1. Create the Parent FamilyMember document
    // The password will be hashed by the 'pre-save' hook in the FamilyMember model.
    const newParent = await FamilyMember.create({
      firstName,
      email,
      role: 'Parent', // Mandatory role assignment
      password: password, // Pass the PLAIN-TEXT password to the model
      householdRefs: [], // Temporarily empty
    });
    
    // Explicitly assert the _id type to Types.ObjectId to resolve 'unknown'
    const parentId: Types.ObjectId = (newParent as IFamilyMember)._id as Types.ObjectId; 

    // 3. Create the initial Household
    const newHousehold = await Household.create({
      householdName: `${firstName}'s Household`,
      parentRefs: [parentId], // Link the new parent immediately
      childProfiles: [], // Start with no children
    });

    // Explicitly assert the _id type to Types.ObjectId to resolve 'unknown'
    const householdId: Types.ObjectId = newHousehold._id as Types.ObjectId;
    
    // 4. Update the Parent's FamilyMember document with the new Household reference
    // We use parentId.toString() here to ensure the ID is a plain string for the query
    await FamilyMember.findByIdAndUpdate(parentId.toString(), {
      $push: { householdRefs: householdId }
    });

    // 5. Generate and return JWT (Parent is automatically logged in)
    const token = signToken(parentId.toString(), householdId.toString());

    // Successful response
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
      res.status(409).json({
        status: 'fail',
        message: 'This email address is already registered.',
      });
      return;
    }

    res.status(500).json({
      status: 'error',
      message: 'Failed to create user or household.',
      error: err.message,
    });
  }
};

/**
 * Controller function to handle Parent Login (Phase 2.1)
 * ... (No change) ...
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ status: 'fail', message: 'Please provide email and password.' });
      return;
    }

    // 1. Find user by email and explicitly select the password field
    const parent = await FamilyMember.findOne({ email }).select('+password');

    // 2. Check if user exists and password is correct
    // We also check for 'Parent' role for security and compliance with auth design.
    const isPasswordCorrect =
      parent && parent.role === 'Parent' && (await parent.comparePassword(password));

    if (!isPasswordCorrect) {
      res.status(401).json({
        status: 'fail',
        message: 'Incorrect email or password.',
      });
      return;
    }

    // CRITICAL: The Parent must belong to at least one household (created during signup)
    const primaryHouseholdId = parent.householdRefs[0];

    // 3. Generate JWT (Parent is now logged in)
    // FIX APPLIED: Explicitly cast parent._id and primaryHouseholdId to Types.ObjectId 
    const token = signToken(
        (parent._id as Types.ObjectId).toString(), 
        (primaryHouseholdId as Types.ObjectId).toString()
    );

    // Successful response
    res.status(200).json({
      status: 'success',
      token,
      data: {
        parent,
      },
    });

  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      message: 'Login failed.',
      error: err.message,
    });
  }
};

// -----------------------------------------------------------------------------
// 2. Authorization Middleware (Restrict by Role) - NEW FUNCTION
// -----------------------------------------------------------------------------

// Factory function that returns the actual middleware
export const restrictTo = (...roles: Array<'Parent' | 'Child'>) => {
  return (req: IAuthRequest, res: Response, next: NextFunction) => {
    // req.user is guaranteed to exist here because this middleware runs AFTER 'protect'
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({
        status: 'fail',
        message: 'You do not have permission to perform this action.',
      });
      return;
    }

    // User has the correct role, grant access
    next();
  };
};

// Example protected route for testing (will be moved later)
export const getMe = (req: IAuthRequest, res: Response): void => {
    res.status(200).json({
        status: 'success',
        data: {
            user: req.user,
            householdId: req.householdId,
        },
    });
};