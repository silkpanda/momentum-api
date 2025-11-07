"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.purchaseStoreItem = exports.completeTask = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const Task_1 = __importDefault(require("../models/Task"));
const Household_1 = __importDefault(require("../models/Household"));
const StoreItem_1 = __importDefault(require("../models/StoreItem")); // <-- NEW IMPORT
const Transaction_1 = __importDefault(require("../models/Transaction"));
// Helper to handle standard model CRUD response
const handleResponse = (res, status, message, data) => {
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
const completeTask = async (req, res) => {
    try {
        const taskId = req.params.taskId;
        const { memberId } = req.body; // The member who is completing the task (can be different from req.user)
        // The household ID is the one currently in context for the authenticated user/session
        const householdId = req.householdId;
        if (!householdId || !memberId) {
            handleResponse(res, 400, 'Missing household context or member ID.', {});
            return;
        }
        // 1. Find the Task and ensure it's not already complete
        const task = await Task_1.default.findOne({ _id: taskId, householdRefId: householdId });
        if (!task) {
            handleResponse(res, 404, 'Task not found or does not belong to your household.', {});
            return;
        }
        if (task.isCompleted) {
            handleResponse(res, 409, 'Task is already marked as complete.', {});
            return;
        }
        // 2. Update the Task Status to completed
        const updatedTask = await Task_1.default.findByIdAndUpdate(taskId, { isCompleted: true }, { new: true });
        // 3. Update the Member's Point Total within the Household
        const pointValue = task.pointsValue;
        const updatedHousehold = await Household_1.default.findOneAndUpdate({
            _id: householdId,
            'childProfiles.memberRefId': memberId, // Target the specific member profile
        }, {
            // Use the positional operator ($) to update the pointsTotal field in the matching array element
            $inc: { 'childProfiles.$.pointsTotal': pointValue }
        }, { new: true });
        if (!updatedHousehold) {
            handleResponse(res, 404, 'Household or member profile not found for point update.', {});
            return;
        }
        // 4. Log the Transaction
        const newTransaction = await Transaction_1.default.create({
            transactionType: 'TaskCompletion',
            pointValue: pointValue,
            memberRefId: memberId,
            // FIX APPLIED: Use new Types.ObjectId() on the string route param
            relatedRefId: new mongoose_1.Types.ObjectId(taskId),
            householdRefId: householdId,
            transactionNote: `Completed task: ${task.taskName}`,
        });
        // 5. Successful response
        res.status(200).json({
            status: 'success',
            message: 'Task completed and points awarded.',
            data: {
                task: updatedTask,
                memberId,
                pointsAwarded: pointValue,
                newPointsTotal: updatedHousehold.childProfiles.find(p => p.memberRefId.equals(memberId))?.pointsTotal,
                transaction: newTransaction,
            },
        });
    }
    catch (err) {
        if (err instanceof mongoose_1.default.Error.CastError) {
            handleResponse(res, 400, 'Invalid ID format.', { error: err.message });
            return;
        }
        handleResponse(res, 500, 'Failed to complete task.', { error: err.message });
    }
};
exports.completeTask = completeTask;
/**
 * Handles the purchase of a StoreItem by a FamilyMember (Child). (Phase 3.4)
 * The API updates the member's point total in the Household, and logs the transaction.
 * POST /api/v1/store-items/:itemId/purchase
 */
const purchaseStoreItem = async (req, res) => {
    try {
        const itemId = req.params.itemId;
        const { memberId } = req.body; // The member who is purchasing the item
        const householdId = req.householdId;
        if (!householdId || !memberId) {
            handleResponse(res, 400, 'Missing household context or member ID.', {});
            return;
        }
        // 1. Find the StoreItem and verify it is available
        const item = await StoreItem_1.default.findOne({ _id: itemId, householdRefId: householdId });
        if (!item || !item.isAvailable) {
            handleResponse(res, 404, 'Store item not found or is currently unavailable.', {});
            return;
        }
        const itemCost = item.cost;
        // 2. Find the Household and the specific member profile to check points
        const household = await Household_1.default.findOne({
            _id: householdId,
            'childProfiles.memberRefId': memberId, // Use query to efficiently target the correct profile
        });
        const memberProfile = household?.childProfiles.find(p => p.memberRefId.equals(memberId));
        if (!memberProfile) {
            handleResponse(res, 404, 'Member profile not found in household.', {});
            return;
        }
        // 3. Check if the member has enough points
        if (memberProfile.pointsTotal < itemCost) {
            handleResponse(res, 402, `Insufficient points. Item costs ${itemCost}, but member only has ${memberProfile.pointsTotal}.`, {
                required: itemCost,
                current: memberProfile.pointsTotal
            });
            return;
        }
        // 4. Update the Member's Point Total within the Household (Decrement points)
        const updatedHousehold = await Household_1.default.findOneAndUpdate({
            _id: householdId,
            'childProfiles.memberRefId': memberId,
        }, {
            // Use the positional operator ($) and $inc with a NEGATIVE value
            $inc: { 'childProfiles.$.pointsTotal': -itemCost }
        }, { new: true });
        // Safety check (shouldn't fail if previous steps succeeded)
        if (!updatedHousehold) {
            handleResponse(res, 500, 'Failed to deduct points from household profile.', {});
            return;
        }
        // 5. Log the Transaction
        const newTransaction = await Transaction_1.default.create({
            transactionType: 'ItemPurchase',
            pointValue: -itemCost, // Logged as a negative value
            memberRefId: memberId,
            // FIX APPLIED: Use new Types.ObjectId() on the string route param
            relatedRefId: new mongoose_1.Types.ObjectId(itemId),
            householdRefId: householdId,
            transactionNote: `Purchased item: ${item.itemName}`,
        });
        const newPointsTotal = updatedHousehold.childProfiles.find(p => p.memberRefId.equals(memberId))?.pointsTotal;
        // 6. Successful response
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
    }
    catch (err) {
        if (err instanceof mongoose_1.default.Error.CastError) {
            handleResponse(res, 400, 'Invalid ID format.', { error: err.message });
            return;
        }
        handleResponse(res, 500, 'Failed to process item purchase.', { error: err.message });
    }
};
exports.purchaseStoreItem = purchaseStoreItem;
//# sourceMappingURL=transactionController.js.map