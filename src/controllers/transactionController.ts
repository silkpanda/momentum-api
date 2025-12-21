// src/controllers/transactionController.ts
import { Response } from 'express';
import mongoose, { Types } from 'mongoose';
import Household from '../models/Household';
import StoreItem from '../models/StoreItem';
import Transaction from '../models/Transaction';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { IFamilyMember } from '../models/FamilyMember';
// import { io } from '../server'; // Import Socket.io instance - REMOVED to avoid circular dependency

// Helper to handle standard model CRUD response
const handleResponse = (res: Response, status: number, message: string, data?: any): void => {
  res.status(status).json({
    status: status >= 400 ? 'fail' : 'success',
    message,
    data,
  });
};

// -----------------------------------------------------------------------------
// CORE TRANSACTION CONTROLLERS
// -----------------------------------------------------------------------------

/**
 * Handles the purchase of a StoreItem by a FamilyMember. (Phase 3.4)
 * POST /api/v1/store-items/:id/purchase
 */
export const purchaseStoreItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // FIX: The route param in storeItemRoutes.ts is ':id', not ':itemId'
    const itemId = req.params.id;
    const { memberId } = req.body; // The member who is purchasing the item

    const { householdId } = req;

    if (!householdId || !memberId) {
      handleResponse(res, 400, 'Missing household context or member ID.', {});
      return;
    }

    const item = await StoreItem.findOne({ _id: itemId, householdRefId: householdId });

    if (!item || !item.isAvailable) {
      handleResponse(res, 404, 'Store item not found or is currently unavailable.', {});
      return;
    }

    const itemCost = item.cost;

    // FIX: Find from 'memberProfiles' array instead of 'childProfiles'
    console.log('[Purchase] Looking for household:', householdId, 'with member:', memberId);

    // Explicitly cast memberId to ObjectId for comparison/querying if needed
    // But Mongoose usually handles this in queries. 
    // Let's verify if `memberId` is string or object.

    const household = await Household.findOne({
      _id: householdId,
      'memberProfiles.familyMemberId': memberId,
    });

    console.log('[Purchase] Household found?', !!household);

    if (!household) {
      // Debugging: Try finding just the household to see if it exists
      const hhExists = await Household.findById(householdId);
      console.log('[Purchase] Household exists by ID?', !!hhExists);
      if (hhExists) {
        console.log('[Purchase] Members in household:', hhExists.memberProfiles.map(p => p.familyMemberId.toString()));
        console.log('[Purchase] Target memberId:', memberId);
      }
    }

    // FIX: Find the profile from 'memberProfiles'
    const memberProfile = household?.memberProfiles.find(
      (p) => p.familyMemberId.toString() === memberId.toString() // Robust comparison
    );

    if (!memberProfile) {
      console.log('[Purchase] Member profile not found in returned household.');
      handleResponse(res, 404, 'Member profile not found in household.', {});
      return;
    }

    if (memberProfile.pointsTotal! < itemCost) { // Added '!' assuming pointsTotal will be defined
      handleResponse(res, 402, `Insufficient points. Item costs ${itemCost}, but member only has ${memberProfile.pointsTotal}.`, {
        required: itemCost,
        current: memberProfile.pointsTotal
      });
      return;
    }

    // FIX: Update 'memberProfiles' array
    const updatedHousehold = await Household.findOneAndUpdate(
      {
        _id: householdId,
        'memberProfiles.familyMemberId': memberId,
      },
      {
        $inc: { 'memberProfiles.$.pointsTotal': -itemCost }
      },
      { new: true }
    );

    if (!updatedHousehold) {
      handleResponse(res, 500, 'Failed to deduct points from household profile.', {});
      return;
    }

    const newTransaction = await Transaction.create({
      transactionType: 'ItemPurchase',
      pointValue: -itemCost, // Logged as a negative value
      memberRefId: memberId,
      relatedRefId: new Types.ObjectId(itemId as string),
      householdRefId: householdId,
      transactionNote: `Purchased item: ${item.itemName}`,
    });

    // FIX: Find new total from 'memberProfiles'
    const updatedMemberProfile = updatedHousehold.memberProfiles.find(
      (p) => p.familyMemberId.equals(memberId)
    );
    const newPointsTotal = updatedMemberProfile?.pointsTotal;

    // Emit real-time update for member points
    const io = req.app.get('io');
    io.to(householdId!.toString()).emit('member_points_updated', {
      memberId: updatedMemberProfile?._id,
      pointsTotal: newPointsTotal,
      householdId,
    });

    res.status(200).json({
      status: 'success',
      message: 'Item purchased and points deducted.',
      data: {
        item,
        memberId,
        pointsDeducted: itemCost,
        newPointsTotal,
        transaction: newTransaction,
      },
    });

  } catch (err: any) {
    if (err instanceof mongoose.Error.CastError) {
      handleResponse(res, 400, 'Invalid ID format.', { error: err.message });
      return;
    }
    handleResponse(res, 500, 'Failed to process item purchase.', { error: err.message });
  }
};