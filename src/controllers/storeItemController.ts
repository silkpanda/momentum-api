import { Response } from 'express';
import mongoose from 'mongoose';
import StoreItem from '../models/StoreItem';
import { AuthenticatedRequest } from '../middleware/authMiddleware'; // Authenticated request with householdId
// import { io } from '../server'; // Socket.io instance - REMOVED to avoid circular dependency

// Helper to standardize responses
const handleResponse = (res: Response, status: number, message: string, data?: any): void => {
  res.status(status).json({
    status: status >= 400 ? 'fail' : 'success',
    message,
    data: data ? { storeItem: data } : undefined,
  });
};

/** Get all StoreItems for the authenticated user's household */
export const getAllStoreItems = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { householdId } = req;
    if (!householdId) {
      handleResponse(res, 400, 'Household context is missing from request.');
      return;
    }
    const items = await StoreItem.find({ householdRefId: householdId });
    res.status(200).json({
      status: 'success',
      results: items.length,
      data: { storeItems: items },
    });
  } catch (err: any) {
    handleResponse(res, 500, 'Failed to retrieve store items.', { error: err.message });
  }
};

/** Create a new StoreItem */
export const createStoreItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { itemName, description = '', cost, isAvailable = true, stock, isInfinite = true } = req.body;
    if (!itemName || cost == null) {
      handleResponse(res, 400, 'Missing mandatory fields: itemName and cost.');
      return;
    }
    const { householdId } = req;
    if (!householdId) {
      handleResponse(res, 400, 'Household context is missing from request.');
      return;
    }
    const newItem = await StoreItem.create({
      itemName,
      description,
      cost,
      isAvailable,
      stock: stock !== undefined ? stock : undefined,
      isInfinite: isInfinite !== undefined ? isInfinite : true,
      householdRefId: householdId,
    });
    const io = req.app.get('io');
    io.to(householdId.toString()).emit('store_item_updated', { type: 'create', storeItem: newItem });
    handleResponse(res, 201, 'Store item created successfully.', newItem);
  } catch (err: any) {
    handleResponse(res, 500, 'Failed to create store item.', { error: err.message });
  }
};

/** Get a single StoreItem by ID */
export const getStoreItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const itemId = req.params.id;
    const { householdId } = req;
    const item = await StoreItem.findOne({ _id: itemId, householdRefId: householdId });
    if (!item) {
      handleResponse(res, 404, 'Store item not found or does not belong to your household.');
      return;
    }
    handleResponse(res, 200, 'Store item retrieved successfully.', item);
  } catch (err: any) {
    if (err instanceof mongoose.Error.CastError) {
      handleResponse(res, 400, 'Invalid item ID format.');
    } else {
      handleResponse(res, 500, 'Failed to retrieve store item.', { error: err.message });
    }
  }
};

/** Update a StoreItem */
export const updateStoreItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const itemId = req.params.id;
    const { householdId } = req;
    if (!householdId) {
      handleResponse(res, 400, 'Household context is missing from request.');
      return;
    }
    const updates = { ...req.body };
    delete updates.householdRefId; // never allow changing household linkage
    const updatedItem = await StoreItem.findOneAndUpdate(
      { _id: itemId, householdRefId: householdId },
      updates,
      { new: true, runValidators: true }
    );
    if (!updatedItem) {
      handleResponse(res, 404, 'Store item not found or does not belong to your household.');
      return;
    }
    const io = req.app.get('io');
    io.to(householdId.toString()).emit('store_item_updated', { type: 'update', storeItem: updatedItem });
    handleResponse(res, 200, 'Store item updated successfully.', updatedItem);
  } catch (err: any) {
    if (err instanceof mongoose.Error.CastError) {
      handleResponse(res, 400, 'Invalid item ID format.');
    } else {
      handleResponse(res, 500, 'Failed to update store item.', { error: err.message });
    }
  }
};

/** Delete a StoreItem */
export const deleteStoreItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const itemId = req.params.id;
    const { householdId } = req;
    if (!householdId) {
      handleResponse(res, 400, 'Household context is missing from request.');
      return;
    }
    const deletedItem = await StoreItem.findOneAndDelete({ _id: itemId, householdRefId: householdId });
    if (!deletedItem) {
      handleResponse(res, 404, 'Store item not found or does not belong to your household.');
      return;
    }
    const io = req.app.get('io');
    io.to(householdId.toString()).emit('store_item_updated', { type: 'delete', storeItemId: itemId });
    res.status(204).json({ status: 'success', data: null });
  } catch (err: any) {
    if (err instanceof mongoose.Error.CastError) {
      handleResponse(res, 400, 'Invalid item ID format.');
    } else {
      handleResponse(res, 500, 'Failed to delete store item.', { error: err.message });
    }
  }
};