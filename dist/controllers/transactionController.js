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
exports.purchaseStoreItem = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const Household_1 = __importDefault(require("../models/Household"));
const StoreItem_1 = __importDefault(require("../models/StoreItem"));
const Transaction_1 = __importDefault(require("../models/Transaction"));
// import { io } from '../server'; // Import Socket.io instance - REMOVED to avoid circular dependency
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
        const updatedMemberProfile = updatedHousehold.memberProfiles.find((p) => p.familyMemberId.equals(memberId));
        const newPointsTotal = updatedMemberProfile?.pointsTotal;
        // Emit real-time update for member points
        // Emit real-time update for member points
        const io = req.app.get('io');
        io.emit('member_points_updated', {
            memberId: updatedMemberProfile?._id,
            pointsTotal: newPointsTotal,
            householdId: householdId,
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