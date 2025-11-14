// src/controllers/transactionController.ts
import { Response } from 'express';
import mongoose, { Types } from 'mongoose';
import Task from '../models/Task';
import Household from '../models/Household';
import StoreItem from '../models/StoreItem'; 
import Transaction from '../models/Transaction';
import { AuthenticatedRequest } from '../middleware/authMiddleware'; 
import { IFamilyMember } from '../models/FamilyMember';

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
 * Handles the completion of a Task by a FamilyMember (Child or Parent). (Phase 3.3)
 * The API updates the Task status, updates the member's point total in the Household,
 * and logs the transaction.
 * POST /api/v1/tasks/:taskId/complete
 */
export const completeTask = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // FIX: The route param in taskRoutes.ts is ':id', not ':taskId'
    const taskId = req.params.id; 
    const { memberId } = req.body; // The member who is completing the task
    
    const householdId = req.householdId; 

    if (!householdId || !memberId) {
        handleResponse(res, 400, 'Missing household context or member ID.', {});
        return;
    }
    
    const task = await Task.findOne({ _id: taskId, householdRefId: householdId });

    if (!task) {
      handleResponse(res, 404, 'Task not found or does not belong to your household.', {});
      return;
    }
    
    // --- FIX 1: Check task.status, not task.isCompleted ---
    if (task.status === 'Completed' || task.status === 'Approved') {
        handleResponse(res, 409, 'Task is already marked as complete.', {});
        return;
    }

    // --- Note: The 'src/controllers/taskController.ts' has its own 'completeTask' logic.
    // --- This controller is for the *transactional* part of completing a task.
    // --- We will need to decide which controller *actually* handles this route.
    // --- For now, I will assume this one does, and I'll update the task status here.
    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      // --- FIX 1 (cont.): Set the status field ---
      { status: 'Completed', completedBy: memberId, completedAt: new Date() },
      { new: true }
    );
    
    // --- FIX 2: Use task.points, not task.pointsValue ---
    const pointValue = task.points;
    
    // FIX: Update 'memberProfiles' array instead of 'childProfiles'
    const updatedHousehold = await Household.findOneAndUpdate(
      { 
        _id: householdId,
        'memberProfiles.familyMemberId': memberId, // Target the specific member profile
      },
      { 
        // Use the positional operator ($) to update the pointsTotal field
        $inc: { 'memberProfiles.$.pointsTotal': pointValue } 
      },
      { new: true }
    );
    
    if (!updatedHousehold) {
        handleResponse(res, 404, 'Household or member profile not found for point update.', {});
        return;
    }

    const newTransaction = await Transaction.create({
      transactionType: 'TaskCompletion',
      pointValue: pointValue,
      memberRefId: memberId,
      relatedRefId: new Types.ObjectId(taskId as string), 
      householdRefId: householdId,
      // --- FIX 3: Use task.title, not task.taskName ---
      transactionNote: `Completed task: ${task.title}`,
    });

    // FIX: Find the updated points total from the 'memberProfiles' array
    const newPointsTotal = updatedHousehold.memberProfiles.find(
        (p) => p.familyMemberId.equals(memberId)
    )?.pointsTotal;

    res.status(200).json({
      status: 'success',
      message: 'Task completed and points awarded.',
      data: {
        task: updatedTask,
        memberId,
        pointsAwarded: pointValue,
        newPointsTotal: newPointsTotal,
        transaction: newTransaction,
      },
    });

  } catch (err: any) {
    if (err instanceof mongoose.Error.CastError) {
      handleResponse(res, 400, 'Invalid ID format.', { error: err.message });
      return;
    }
    handleResponse(res, 500, 'Failed to complete task.', { error: err.message });
  }
};

/**
 * Handles the purchase of a StoreItem by a FamilyMember. (Phase 3.4)
 * POST /api/v1/store-items/:id/purchase
 */
export const purchaseStoreItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // FIX: The route param in storeItemRoutes.ts is ':id', not ':itemId'
    const itemId = req.params.id; 
    const { memberId } = req.body; // The member who is purchasing the item
    
    const householdId = req.householdId; 

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
    const household = await Household.findOne({ 
        _id: householdId,
        'memberProfiles.familyMemberId': memberId, 
    });
    
    // FIX: Find the profile from 'memberProfiles'
    const memberProfile = household?.memberProfiles.find(
        (p) => p.familyMemberId.equals(memberId)
    );
    
    if (!memberProfile) {
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
    const newPointsTotal = updatedHousehold.memberProfiles.find(
        (p) => p.familyMemberId.equals(memberId)
    )?.pointsTotal;

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