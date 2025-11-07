import { Response } from 'express';
import { Types } from 'mongoose';
import Household from '../models/Household';
import FamilyMember from '../models/FamilyMember';
import { IAuthRequest } from '../middleware/authMiddleware'; // Get our extended request interface
import { IFamilyMember } from '../models/FamilyMember'; // Import IFamilyMember for proper typing

// -----------------------------------------------------------------------------
// HELPER: Mandatory Profile Color Palette (Source: Governance Document)
// -----------------------------------------------------------------------------

// Used to select a unique color for new child profiles
const PROFILE_COLORS = [
  '#4285F4', // Blueberry
  '#1967D2', // Celtic Blue
  '#FBBC04', // Selective Yellow
  '#F72A25', // Pigment Red
  '#34A853', // Sea Green
  '#188038', // Dark Spring Green
  '#FF8C00', // Tangerine
  '#8E24AA', // Grape
  '#E67C73', // Flamingo
  '#039BE5', // Peacock
];

/**
 * Helper to get a color that is not currently in use by the household members.
 * Falls back to a random color if all 10 are in use (unlikely).
 */
const getAvailableColor = (usedColors: string[]): string => {
  const availableColors = PROFILE_COLORS.filter(color => !usedColors.includes(color));
  
  if (availableColors.length > 0) {
    // Return the first available color for consistency
    return availableColors[0];
  }
  
  // Fallback: If all colors are used, return a random one
  return PROFILE_COLORS[Math.floor(Math.random() * PROFILE_COLORS.length)];
};


// -----------------------------------------------------------------------------
// CORE CONTROLLERS
// -----------------------------------------------------------------------------


/**
 * Controller function to handle creating a new Household (Phase 2.2)
 * The parent is extracted from req.user (via the 'protect' middleware).
 */
export const createHousehold = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { householdName } = req.body;
    
    // The user object is guaranteed to exist and be a Parent here, 
    // thanks to the 'protect' and 'restrictTo('Parent')' middleware.
    
    // FIX APPLIED: Check if req.user exists and correctly cast req.user._id to Types.ObjectId
    if (!req.user) {
        res.status(401).json({ status: 'fail', message: 'Authentication required.' });
        return;
    }
    
    const parentId: Types.ObjectId = (req.user as IFamilyMember)._id as Types.ObjectId; 
    
    if (!householdName) {
      res.status(400).json({ status: 'fail', message: 'Missing mandatory field: householdName.' });
      return;
    }
    
    // 1. Create the new Household document
    const newHousehold = await Household.create({
      householdName,
      parentRefs: [parentId], // Link the creating parent immediately
      childProfiles: [],
    });
    
    const householdId = newHousehold._id;

    // 2. Update the Parent's FamilyMember document to reference the new Household
    await FamilyMember.findByIdAndUpdate(parentId.toString(), {
      $push: { householdRefs: householdId }
    });

    // 3. Successful response
    res.status(201).json({
      status: 'success',
      message: 'New household created and linked successfully.',
      data: {
        household: newHousehold,
      },
    });

  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to create household.',
      error: err.message,
    });
  }
};


/**
 * Controller function to add a new FamilyMember (Child) to a Household (Phase 2.2)
 * This function handles creating the Child profile and embedding their data in the Household.
 */
export const addFamilyMember = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { firstName } = req.body;
    // The household ID is taken from the route parameter
    const householdId = req.params.id; 
    
    if (!firstName || !householdId) {
      res.status(400).json({ status: 'fail', message: 'Missing mandatory fields: firstName or household ID.' });
      return;
    }
    
    // 1. Find the target household
    const household = await Household.findById(householdId);

    if (!household) {
      res.status(404).json({ status: 'fail', message: 'Household not found.' });
      return;
    }
    
    // 2. Determine an unused profile color
    const usedColors = household.childProfiles.map(profile => profile.profileColor);
    const profileColor = getAvailableColor(usedColors);
    
    // 3. Create the new FamilyMember (Child) document
    const newChild = await FamilyMember.create({
      firstName,
      // Children do not have an email or password, as per the Kiosk View/Frictionless Access design
      email: `${firstName.toLowerCase()}-${Date.now()}@child.momentum`, 
      role: 'Child', 
      householdRefs: [householdId as any], // Link to the new household
    });
    
    const childId = newChild._id;

    // 4. Update the Household with the new Child Profile (Embedded Document)
    const newChildProfile = {
      memberRefId: childId,
      profileColor,
      pointsTotal: 0,
    };
    
    const updatedHousehold = await Household.findByIdAndUpdate(
        householdId,
        { $push: { childProfiles: newChildProfile } },
        { new: true, runValidators: true }
    );
    
    // 5. Successful response
    res.status(201).json({
      status: 'success',
      message: 'New child profile created and added to household.',
      data: {
        child: newChild,
        household: updatedHousehold,
      },
    });

  } catch (err: any) {
    // Handle duplicate key error if we attempt to use an existing email (unlikely for children)
    if (err.code === 11000) { 
      res.status(409).json({
        status: 'fail',
        message: 'A profile with this identifier already exists.',
      });
      return;
    }
    res.status(500).json({
      status: 'error',
      message: 'Failed to add family member.',
      error: err.message,
    });
  }
};