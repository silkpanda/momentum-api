"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteStoreItem = exports.updateStoreItem = exports.getStoreItem = exports.createStoreItem = exports.getAllStoreItems = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const StoreItem_1 = __importDefault(require("../models/StoreItem"));
// import { io } from '../server'; // Socket.io instance - REMOVED to avoid circular dependency
// Helper to standardize responses
const handleResponse = (res, status, message, data) => {
    res.status(status).json({
        status: status >= 400 ? 'fail' : 'success',
        message,
        data: data ? { storeItem: data } : undefined,
    });
};
/** Get all StoreItems for the authenticated user's household */
const getAllStoreItems = async (req, res) => {
    try {
        const householdId = req.householdId;
        if (!householdId) {
            handleResponse(res, 400, 'Household context is missing from request.');
            return;
        }
        const items = await StoreItem_1.default.find({ householdRefId: householdId });
        res.status(200).json({
            status: 'success',
            results: items.length,
            data: { storeItems: items },
        });
    }
    catch (err) {
        handleResponse(res, 500, 'Failed to retrieve store items.', { error: err.message });
    }
};
exports.getAllStoreItems = getAllStoreItems;
/** Create a new StoreItem */
const createStoreItem = async (req, res) => {
    try {
        const { itemName, description = '', cost, isAvailable = true, stock, isInfinite = true } = req.body;
        if (!itemName || cost == null) {
            handleResponse(res, 400, 'Missing mandatory fields: itemName and cost.');
            return;
        }
        const householdId = req.householdId;
        if (!householdId) {
            handleResponse(res, 400, 'Household context is missing from request.');
            return;
        }
        const newItem = await StoreItem_1.default.create({
            itemName,
            description,
            cost,
            isAvailable,
            stock: stock !== undefined ? stock : undefined,
            isInfinite: isInfinite !== undefined ? isInfinite : true,
            householdRefId: householdId,
        });
        const io = req.app.get('io');
        io.to(householdId).emit('store_item_updated', { type: 'create', storeItem: newItem });
        handleResponse(res, 201, 'Store item created successfully.', newItem);
    }
    catch (err) {
        handleResponse(res, 500, 'Failed to create store item.', { error: err.message });
    }
};
exports.createStoreItem = createStoreItem;
/** Get a single StoreItem by ID */
const getStoreItem = async (req, res) => {
    try {
        const itemId = req.params.id;
        const householdId = req.householdId;
        const item = await StoreItem_1.default.findOne({ _id: itemId, householdRefId: householdId });
        if (!item) {
            handleResponse(res, 404, 'Store item not found or does not belong to your household.');
            return;
        }
        handleResponse(res, 200, 'Store item retrieved successfully.', item);
    }
    catch (err) {
        if (err instanceof mongoose_1.default.Error.CastError) {
            handleResponse(res, 400, 'Invalid item ID format.');
        }
        else {
            handleResponse(res, 500, 'Failed to retrieve store item.', { error: err.message });
        }
    }
};
exports.getStoreItem = getStoreItem;
/** Update a StoreItem */
const updateStoreItem = async (req, res) => {
    try {
        const itemId = req.params.id;
        const householdId = req.householdId;
        const updates = { ...req.body };
        delete updates.householdRefId; // never allow changing household linkage
        const updatedItem = await StoreItem_1.default.findOneAndUpdate({ _id: itemId, householdRefId: householdId }, updates, { new: true, runValidators: true });
        if (!updatedItem) {
            handleResponse(res, 404, 'Store item not found or does not belong to your household.');
            return;
        }
        const io = req.app.get('io');
        io.to(householdId).emit('store_item_updated', { type: 'update', storeItem: updatedItem });
        handleResponse(res, 200, 'Store item updated successfully.', updatedItem);
    }
    catch (err) {
        if (err instanceof mongoose_1.default.Error.CastError) {
            handleResponse(res, 400, 'Invalid item ID format.');
        }
        else {
            handleResponse(res, 500, 'Failed to update store item.', { error: err.message });
        }
    }
};
exports.updateStoreItem = updateStoreItem;
/** Delete a StoreItem */
const deleteStoreItem = async (req, res) => {
    try {
        const itemId = req.params.id;
        const householdId = req.householdId;
        const deletedItem = await StoreItem_1.default.findOneAndDelete({ _id: itemId, householdRefId: householdId });
        if (!deletedItem) {
            handleResponse(res, 404, 'Store item not found or does not belong to your household.');
            return;
        }
        const io = req.app.get('io');
        io.to(householdId).emit('store_item_updated', { type: 'delete', storeItemId: itemId });
        res.status(204).json({ status: 'success', data: null });
    }
    catch (err) {
        if (err instanceof mongoose_1.default.Error.CastError) {
            handleResponse(res, 400, 'Invalid item ID format.');
        }
        else {
            handleResponse(res, 500, 'Failed to delete store item.', { error: err.message });
        }
    }
};
exports.deleteStoreItem = deleteStoreItem;
//# sourceMappingURL=storeItemController.js.map