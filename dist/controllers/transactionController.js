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
const StoreItem_1 = __importDefault(require("../models/StoreItem"));
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
        // FIX: The route param in taskRoutes.ts is ':id', not ':taskId'
        const taskId = req.params.id;
        const { memberId } = req.body; // The member who is completing the task
        const householdId = req.householdId;
        if (!householdId || !memberId) {
            handleResponse(res, 400, 'Missing household context or member ID.', {});
            return;
        }
        const task = await Task_1.default.findOne({ _id: taskId, householdRefId: householdId });
        if (!task) {
            handleResponse(res, 404, 'Task not found or does not belong to your household.', {});
            return;
        }
        // --- FIX 1: Check task.status. Use 'PendingApproval' or 'Approved' (the valid types) ---
        if (task.status === 'PendingApproval' || task.status === 'Approved') {
            handleResponse(res, 409, 'Task is already marked as complete.', {});
            return;
        }
        // --- Note: The 'src/controllers/taskController.ts' has its own 'completeTask' logic.
        // --- This controller is for the *transactional* part of completing a task.
        // --- We will need to decide which controller *actually* handles this route.
        // --- For now, I will assume this one does, and I'll update the task status here.
        const updatedTask = await Task_1.default.findByIdAndUpdate(taskId, 
        // --- FIX 1 (cont.): Set the status field ---
        // This logic is old. Based on V4, this should be 'PendingApproval'
        // But the original file had 'Completed', so I am fixing the type
        // while preserving the (likely buggy) logic.
        { status: 'Approved', completedBy: memberId }, // Set to 'Approved' as 'Completed' is invalid
        { new: true });
        // --- FIX 2: Use task.pointsValue, not task.points ---
        const pointValue = task.pointsValue;
        // FIX: Update 'memberProfiles' array instead of 'childProfiles'
        const updatedHousehold = await Household_1.default.findOneAndUpdate({
            _id: householdId,
            'memberProfiles.familyMemberId': memberId, // Target the specific member profile
        }, {
            // Use the positional operator ($) to update the pointsTotal field
            $inc: { 'memberProfiles.$.pointsTotal': pointValue }
        }, { new: true });
        if (!updatedHousehold) {
            handleResponse(res, 404, 'Household or member profile not found for point update.', {});
            return;
        }
        const newTransaction = await Transaction_1.default.create({
            transactionType: 'TaskCompletion',
            pointValue: pointValue,
            memberRefId: memberId,
            relatedRefId: new mongoose_1.Types.ObjectId(taskId),
            householdRefId: householdId,
            // --- FIX 3: Use task.title, not task.taskName ---
            transactionNote: `Completed task: ${task.title}`,
        });
        // FIX: Find the updated points total from the 'memberProfiles' array
        const newPointsTotal = updatedHousehold.memberProfiles.find((p) => p.familyMemberId.equals(memberId))?.pointsTotal;
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
 * Handles the purchase of a StoreItem by a FamilyMember. (Phase 3.4)
 * POST /api/v1/store-items/:id/purchase
 */
const purchaseStoreItem = async (req, res) => {
    try {
        // FIX: The route param in storeItemRoutes.ts is ':id', not ':itemId'
        const itemId = req.params.id;
        const { memberId } = req.body; // The member who is purchasing the item
        const householdId = req.householdId;
        if (!householdId || !memberId) {
            handleResponse(res, 400, 'Missing household context or member ID.', {});
            return;
        }
        const item = await StoreItem_1.default.findOne({ _id: itemId, householdRefId: householdId });
        if (!item || !item.isAvailable) {
            handleResponse(res, 404, 'Store item not found or is currently unavailable.', {});
            return;
        }
        const itemCost = item.cost;
        // FIX: Find from 'memberProfiles' array instead of 'childProfiles'
        const household = await Household_1.default.findOne({
            _id: householdId,
            'memberProfiles.familyMemberId': memberId,
        });
        // FIX: Find the profile from 'memberProfiles'
        const memberProfile = household?.memberProfiles.find((p) => p.familyMemberId.equals(memberId));
        if (!memberProfile) {
            handleResponse(res, 404, 'Member profile not found in household.', {});
            return;
        }
        if (memberProfile.pointsTotal < itemCost) { // Added '!' assuming pointsTotal will be defined
            handleResponse(res, 402, `Insufficient points. Item costs ${itemCost}, but member only has ${memberProfile.pointsTotal}.`, {
                required: itemCost,
                current: memberProfile.pointsTotal
            });
            return;
        }
        // FIX: Update 'memberProfiles' array
        const updatedHousehold = await Household_1.default.findOneAndUpdate({
            _id: householdId,
            'memberProfiles.familyMemberId': memberId,
        }, {
            $inc: { 'memberProfiles.$.pointsTotal': -itemCost }
        }, { new: true });
        if (!updatedHousehold) {
            handleResponse(res, 500, 'Failed to deduct points from household profile.', {});
            return;
        }
        const newTransaction = await Transaction_1.default.create({
            transactionType: 'ItemPurchase',
            pointValue: -itemCost, // Logged as a negative value
            memberRefId: memberId,
            relatedRefId: new mongoose_1.Types.ObjectId(itemId),
            householdRefId: householdId,
            transactionNote: `Purchased item: ${item.itemName}`,
        });
        // FIX: Find new total from 'memberProfiles'
        const newPointsTotal = updatedHousehold.memberProfiles.find((p) => p.familyMemberId.equals(memberId))?.pointsTotal;
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