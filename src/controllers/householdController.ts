// silkpanda/momentum-api/momentum-api-556c5b7b5d534751fdc505eedf6113f20a02cc98/src/controllers/householdController.ts
import { Response } from 'express';
import mongoose, { Types } from 'mongoose';
import Household, { IHousehold } from '../models/Household'; // <-- FIX APPLIED: Import IHousehold
import FamilyMember, { IFamilyMember } from '../models/FamilyMember';
import { IAuthRequest } from '../middleware/authMiddleware';
import Task from '../models/Task'; // <-- NEW IMPORT: Required for cascaded delete
import StoreItem from '../models/StoreItem'; // <-- NEW IMPORT: Required for cascaded delete

// -----------------------------------------------------------------------------
// HELPER: Utility Functions and Constants
// -----------------------------------------------------------------------------

// Used to select a unique color for new child profiles (Source: Governance Document)
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

/**
 * Helper to handle standard model CRUD response.
 */
const handleResponse = (res: Response, status: number, message: string, data?: any): void => {
  res.status(status).json({
    status: status >= 400 ? 'fail' : 'success',
    message,
    data: data ? { household: data } : undefined,
  });
};


// -----------------------------------------------------------------------------
// 1. HOUSEHOLD CRUD CONTROLLERS (Phase 2.2)
// -----------------------------------------------------------------------------

/**
 * Controller function to handle creating a new Household.
 */
export const createHousehold = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { householdName } = req.body;
    
    // req.user is guaranteed to exist and be a Parent here
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
 * Get all Households the Parent belongs to.
 */
export const getAllHouseholds = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    // req.user is guaranteed to exist and be a Parent here
    const parentId: Types.ObjectId = (req.user as IFamilyMember)._id as Types.ObjectId; 
    
    // Find all households where this Parent ID is in the parentRefs array
    const households = await Household.find({ parentRefs: parentId })
      .populate('parentRefs', 'firstName email') // Get Parent names/emails
      .populate('childProfiles.memberRefId', 'firstName'); // Get Child names

    res.status(200).json({
      status: 'success',
      results: households.length,
      data: {
        households,
      },
    });
  } catch (err: any) {
    handleResponse(res, 500, 'Failed to retrieve households.', { error: err.message });
  }
};

/**
 * Get a single Household by ID.
 */
export const getHousehold = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const householdId = req.params.id;
    const parentId: Types.ObjectId = (req.user as IFamilyMember)._id as Types.ObjectId; 
    
    // Find the household by ID AND ensure the authenticated Parent belongs to it
    const household = await Household.findOne({
      _id: householdId,
      parentRefs: parentId,
    })
      .populate('parentRefs', 'firstName email') 
      .populate('childProfiles.memberRefId', 'firstName');

    if (!household) {
      handleResponse(res, 404, 'Household not found or you do not have access.');
      return;
    }

    handleResponse(res, 200, 'Household retrieved successfully.', household);
    
  } catch (err: any) {
    if (err instanceof mongoose.Error.CastError) {
      handleResponse(res, 400, 'Invalid household ID format.');
      return;
    }
    handleResponse(res, 500, 'Failed to retrieve household.', { error: err.message });
  }
};

/**
 * Update a Household by ID (e.g., rename the household).
 */
export const updateHousehold = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const householdId = req.params.id;
    const parentId: Types.ObjectId = (req.user as IFamilyMember)._id as Types.ObjectId; 
    
    // Only allow updating the householdName for now
    const updates = { householdName: req.body.householdName };

    if (!updates.householdName) {
        handleResponse(res, 400, 'Missing mandatory field: householdName for update.');
        return;
    }

    // Find the household by ID, ensure the parent belongs to it, and update it
    const updatedHousehold = await Household.findOneAndUpdate(
      {
        _id: householdId,
        parentRefs: parentId,
      },
      updates,
      { new: true, runValidators: true }
    )
      .populate('parentRefs', 'firstName email')
      .populate('childProfiles.memberRefId', 'firstName');

    if (!updatedHousehold) {
      handleResponse(res, 404, 'Household not found or you do not have permission to update it.');
      return;
    }

    handleResponse(res, 200, 'Household updated successfully.', updatedHousehold);
    
  } catch (err: any) {
    if (err instanceof mongoose.Error.CastError) {
      handleResponse(res, 400, 'Invalid household ID format.');
      return;
    }
    res.status(500).json({
      status: 'error',
      message: 'Failed to update household.',
      error: err.message,
    });
  }
};

/**
 * Delete a Household by ID.
 */
export const deleteHousehold = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const householdId = req.params.id;
    const parentId: Types.ObjectId = (req.user as IFamilyMember)._id as Types.ObjectId; 

    // 1. Find and Delete the Household, ensuring the Parent belongs to it.
    const deletedHousehold = await Household.findOneAndDelete({
      _id: householdId,
      parentRefs: parentId,
    });

    if (!deletedHousehold) {
      handleResponse(res, 404, 'Household not found or you do not have permission to delete it.');
      return;
    }
    
    // CRITICAL: We need to clean up references from other documents
    
    // 2. Remove householdRefId from ALL associated FamilyMembers (Parents and Children)
    const allMemberRefs = [
        ...deletedHousehold.parentRefs.map(id => id.toString()),
        ...deletedHousehold.childProfiles.map(profile => profile.memberRefId.toString()),
    ];

    await FamilyMember.updateMany(
        { _id: { $in: allMemberRefs } },
        { $pull: { householdRefs: deletedHousehold._id } }
    );
    
    // 3. Delete all associated Tasks and StoreItems (CRITICAL cleanup)
    await Task.deleteMany({ householdRefId: deletedHousehold._id });
    await StoreItem.deleteMany({ householdRefId: deletedHousehold._id });

    // Successful deletion returns 204 No Content
    res.status(204).json({
      status: 'success',
      data: null,
    });

  } catch (err: any) {
    if (err instanceof mongoose.Error.CastError) {
      handleResponse(res, 400, 'Invalid household ID format.');
      return;
    }
    handleResponse(res, 500, 'Failed to delete household.', { error: err.message });
  }
};


// -----------------------------------------------------------------------------
// 2. FAMILY MEMBER CRUD CONTROLLERS (Phase 2.2 - Child Management)
// -----------------------------------------------------------------------------

/**
 * Controller function to add a new FamilyMember (Child) to a Household. 
 * POST /api/v1/households/:id/members
 */
export const addFamilyMember = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { firstName, profileColor: suggestedColor } = req.body;
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
    
    // Authorization Check: Parent must belong to this household to add members
    const parentId: Types.ObjectId = (req.user as IFamilyMember)._id as Types.ObjectId;
    if (!household.parentRefs.some(ref => ref.equals(parentId))) {
        res.status(403).json({ status: 'fail', message: 'You do not have permission to add members to this household.' });
        return;
    }
    
    // 2. Determine an unused profile color (Respect suggestedColor if valid and not used)
    const usedColors = household.childProfiles.map(profile => profile.profileColor);
    let profileColor = getAvailableColor(usedColors);

    if (suggestedColor && !usedColors.includes(suggestedColor) && PROFILE_COLORS.includes(suggestedColor)) {
        profileColor = suggestedColor;
    }
    
    // 3. Create the new FamilyMember (Child) document
    const newChild = await FamilyMember.create({
      firstName,
      // Children do not have an email or password
      email: `${firstName.toLowerCase().replace(/\s/g, '')}-${Date.now()}@child.momentum`, // Ensure email is unique
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

/**
 * Update an existing FamilyMember (Child) within the Household context.
 * PATCH /api/v1/households/:id/members/:memberId
 */
export const updateFamilyMember = async (req: IAuthRequest, res: Response): Promise<void> => {
    try {
        const householdId = req.params.id;
        const memberId = req.params.memberId;
        const { firstName, profileColor } = req.body;
        const parentId: Types.ObjectId = (req.user as IFamilyMember)._id as Types.ObjectId;

        if (!householdId || !memberId) {
            handleResponse(res, 400, 'Missing household or member ID.');
            return;
        }

        // 1. Find the household and ensure the parent has access
        const household = await Household.findOne({
            _id: householdId,
            parentRefs: parentId,
        });

        if (!household) {
            handleResponse(res, 404, 'Household not found or you do not have access.');
            return;
        }
        
        // 2. Prepare updates for the embedded profile
        const profileUpdate: any = {};
        
        // --- Update Embedded Profile Color (Child) ---
        if (profileColor) {
            const usedColors = household.childProfiles
                .filter(p => !p.memberRefId.equals(memberId)) // Exclude the member being updated
                .map(p => p.profileColor);
            
            if (usedColors.includes(profileColor) || !PROFILE_COLORS.includes(profileColor)) {
                res.status(400).json({ status: 'fail', message: 'Invalid or already-in-use profile color.' });
                return;
            }
            // Use positional operator '$' to update the matching element in the array
            profileUpdate['childProfiles.$.profileColor'] = profileColor;
        }

        // 3. Update the FamilyMember's main document (only firstName is changeable here)
        if (firstName) {
            await FamilyMember.findByIdAndUpdate(memberId, { firstName });
        }

        // 4. Update the embedded profile in the Household document
        let updatedHousehold: (mongoose.Document<unknown, {}, IHousehold> & IHousehold & Required<{ _id: unknown; }> & { __v: number; }) | null = household;

        if (Object.keys(profileUpdate).length > 0) {
             updatedHousehold = await Household.findOneAndUpdate(
                // Find the document where ID matches AND the embedded array contains the member ID
                { _id: householdId, 'childProfiles.memberRefId': memberId },
                { $set: profileUpdate },
                { new: true }
            );
        }

        if (!updatedHousehold) {
            handleResponse(res, 404, 'Member not found in household.');
            return;
        }

        res.status(200).json({
            status: 'success',
            message: 'Family member profile updated successfully.',
            data: {
                household: updatedHousehold,
            },
        });

    } catch (err: any) {
        if (err instanceof mongoose.Error.CastError) {
            handleResponse(res, 400, 'Invalid ID format.');
            return;
        }
        res.status(500).json({
            status: 'error',
            message: 'Failed to update family member.',
            error: err.message,
        });
    }
};

/**
 * Delete an existing FamilyMember (Child) from the Household.
 * DELETE /api/v1/households/:id/members/:memberId
 */
export const deleteFamilyMember = async (req: IAuthRequest, res: Response): Promise<void> => {
    try {
        const householdId = req.params.id;
        const memberId = req.params.memberId;
        const parentId: Types.ObjectId = (req.user as IFamilyMember)._id as Types.ObjectId;

        // 1. Find the household and ensure the parent has access
        const household = await Household.findOne({
            _id: householdId,
            parentRefs: parentId,
        });

        if (!household) {
            handleResponse(res, 404, 'Household not found or you do not have access.');
            return;
        }
        
        // Check if member is a Parent (Parents cannot be deleted via this endpoint)
        const memberToDelete = await FamilyMember.findById(memberId);
        if (!memberToDelete || memberToDelete.role === 'Parent') {
            res.status(403).json({ status: 'fail', message: 'Cannot delete a Parent via this endpoint.' });
            return;
        }

        // 2. Remove the memberRefId from the Household's childProfiles embedded array
        const updatedHousehold = await Household.findByIdAndUpdate(
            householdId,
            { $pull: { childProfiles: { memberRefId: memberId } } },
            { new: true }
        );

        // 3. Remove the householdRefId from the FamilyMember's main document
        await FamilyMember.findByIdAndUpdate(memberId, {
            $pull: { householdRefs: householdId }
        });
        
        // 4. CRITICAL: Check if the child now belongs to 0 households. If so, delete the FamilyMember document.
        const cleanedMember = await FamilyMember.findById(memberId);
        if (cleanedMember && cleanedMember.householdRefs.length === 0) {
            // No longer belongs to any household, safe to delete the user profile completely.
            await FamilyMember.findByIdAndDelete(memberId);
        }

        if (!updatedHousehold) {
            handleResponse(res, 404, 'Member not found in household.');
            return;
        }

        res.status(200).json({
            status: 'success',
            message: 'Family member removed successfully.',
            data: {
                household: updatedHousehold,
            },
        });

    } catch (err: any) {
        if (err instanceof mongoose.Error.CastError) {
            handleResponse(res, 400, 'Invalid ID format.');
            return;
        }
        res.status(500).json({
            status: 'error',
            message: 'Failed to delete family member.',
            error: err.message,
        });
    }
};