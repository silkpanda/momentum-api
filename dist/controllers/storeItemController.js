"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteStoreItem = exports.updateStoreItem = exports.getStoreItem = exports.createStoreItem = exports.getAllStoreItems = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const StoreItem_1 = __importDefault(require("../models/StoreItem"));
// Helper to handle standard model CRUD response
const handleResponse = (res, status, message, data) => {
    res.status(status).json({
        status: status >= 400 ? 'fail' : 'success',
        message,
        data: data ? { storeItem: data } : undefined,
    });
};
// -----------------------------------------------------------------------------
// CORE CONTROLLERS (Phase 3.4)
// -----------------------------------------------------------------------------
/**
 * Get all StoreItems for the authenticated user's primary Household.
 */
const getAllStoreItems = async (req, res) => {
    try {
        // Items must be retrieved within the user's household context
        const householdId = req.householdId;
        if (!householdId) {
            handleResponse(res, 400, 'Household context is missing from request.');
            return;
        }
        const items = await StoreItem_1.default.find({ householdRefId: householdId });
        res.status(200).json({
            status: 'success',
            results: items.length,
            data: {
                storeItems: items,
            },
        });
    }
    catch (err) {
        handleResponse(res, 500, 'Failed to retrieve store items.', { error: err.message });
    }
};
exports.getAllStoreItems = getAllStoreItems;
/**
 * Create a new StoreItem for the authenticated user's primary Household.
 */
const createStoreItem = async (req, res) => {
    try {
        const { itemName, description, cost, isAvailable } = req.body;
        // FIX: Remove 'description' from the validation check
        if (!itemName || !cost) {
            handleResponse(res, 400, 'Missing mandatory fields: itemName and cost.');
            return;
        }
        const householdId = req.householdId;
        if (!householdId) {
            handleResponse(res, 400, 'Household context is missing from request.');
            return;
        }
        // Create the item, linking it to the Household from the JWT payload
        const newItem = await StoreItem_1.default.create({
            itemName,
            description, // This can now be an empty string
            cost,
            isAvailable,
            householdRefId: householdId, // CRITICAL: Scope item to the Household
        });
        handleResponse(res, 201, 'Store item created successfully.', newItem);
    }
    catch (err) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to create store item.',
            error: err.message,
        });
    }
};
exports.createStoreItem = createStoreItem;
/**
 * Get a single StoreItem by ID.
 */
const getStoreItem = async (req, res) => {
    try {
        const itemId = req.params.id;
        const householdId = req.householdId;
        // Find the item by ID AND ensure it belongs to the current household
        const item = await StoreItem_1.default.findOne({
            _id: itemId,
            householdRefId: householdId,
        });
        if (!item) {
            handleResponse(res, 404, 'Store item not found or does not belong to your household.');
            return;
        }
        handleResponse(res, 200, 'Store item retrieved successfully.', item);
    }
    catch (err) {
        if (err instanceof mongoose_1.default.Error.CastError) {
            handleResponse(res, 400, 'Invalid item ID format.');
            return;
        }
        handleResponse(res, 500, 'Failed to retrieve store item.', { error: err.message });
    }
};
exports.getStoreItem = getStoreItem;
/**
 * Update a StoreItem by ID.
 */
const updateStoreItem = async (req, res) => {
    try {
        const itemId = req.params.id;
        const householdId = req.householdId;
        // Prevent updating householdRefId via this general update endpoint
        const updates = { ...req.body };
        delete updates.householdRefId;
        // Find the item by ID and household ID, and then update it
        const updatedItem = await StoreItem_1.default.findOneAndUpdate({
            _id: itemId,
            householdRefId: householdId,
        }, updates, { new: true, runValidators: true });
        if (!updatedItem) {
            handleResponse(res, 404, 'Store item not found or does not belong to your household.');
            return;
        }
        handleResponse(res, 200, 'Store item updated successfully.', updatedItem);
    }
    catch (err) {
        if (err instanceof mongoose_1.default.Error.CastError) {
            handleResponse(res, 400, 'Invalid item ID format.');
            return;
        }
        res.status(500).json({
            status: 'error',
            message: 'Failed to update store item.',
            error: err.message,
        });
    }
};
exports.updateStoreItem = updateStoreItem;
/**
 * Delete a StoreItem by ID.
 */
const deleteStoreItem = async (req, res) => {
    try {
        const itemId = req.params.id;
        const householdId = req.householdId;
        // Find the item by ID AND ensure it belongs to the current household before deleting
        const deletedItem = await StoreItem_1.default.findOneAndDelete({
            _id: itemId,
            householdRefId: householdId,
        });
        if (!deletedItem) {
            handleResponse(res, 404, 'Store item not found or does not belong to your household.');
            return;
        }
        // Successful deletion returns 204 No Content
        res.status(204).json({
            status: 'success',
            data: null,
        });
    }
    catch (err) {
        if (err instanceof mongoose_1.default.Error.CastError) {
            handleResponse(res, 400, 'Invalid item ID format.');
            return;
        }
        handleResponse(res, 500, 'Failed to delete store item.', { error: err.message });
    }
};
exports.deleteStoreItem = deleteStoreItem;
//# sourceMappingURL=storeItemController.js.map