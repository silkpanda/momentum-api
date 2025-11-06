import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import FamilyMember from '../models/FamilyMember';
import Household from '../models/Household';
import { JWT_SECRET, JWT_EXPIRES_IN, BCRYPT_SALT_ROUNDS } from '../config/constants';
import { IFamilyMember } from '../models/FamilyMember';

// Helper function to generate a JWT (used by both signup and login)
const signToken = (id: string, householdRefId: string): string => {
  // Payload contains the user ID and their primary household context
  const payload = { id, householdRefId };
  
  // Options object containing the expiration time
  const options = { 
      expiresIn: JWT_EXPIRES_IN 
  };
  
  // Use the synchronous version of sign(payload, secret, options)
  return jwt.sign(payload, JWT_SECRET, options);
};

/**
 * Controller function to handle Parent Sign-Up (Phase 2.1)
 * 1. Hashes the password.
 * 2. Creates the FamilyMember (Parent).
 * 3. Creates the Household, linking the parent to it.
 * 4. Generates and returns a JWT.
 */
export const signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { firstName, email, password } = req.body;

    if (!firstName || !email || !password) {
      res.status(400).json({ status: 'fail', message: 'Missing mandatory fields: firstName, email, and password.' });
      return;
    }

    // 1. Hash the password
    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // 2. Create the Parent FamilyMember document
    const newParent = await FamilyMember.create({
      firstName,
      email,
      role: 'Parent', // Mandatory role assignment
      password: hashedPassword, 
      householdRefs: [], // Temporarily empty
    });
    
    // FIX APPLIED: Explicitly assert the type of newParent before accessing _id
    const parentId = (newParent as IFamilyMember)._id; 

    // 3. Create the initial Household
    const newHousehold = await Household.create({
      householdName: `${firstName}'s Household`,
      parentRefs: [parentId], // Link the new parent immediately
      childProfiles: [], // Start with no children
    });

    const householdId = newHousehold._id;
    
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
// ... login and protection logic will go here later