import { Response } from 'express';
import mongoose, { Types } from 'mongoose';
import StoreItem from '../models/StoreItem';
import { AuthenticatedRequest } from '../middleware/authMiddleware'; // <-- FIX: Renamed to AuthenticatedRequest
import { io } from '../server'; // Import Socket.io instance

// Helper to handle standard model CRUD response
const handleResponse = (res: Response, status: number, message: string, data?: any): void => {
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
export const getAllStoreItems = async (req: AuthenticatedRequest, res: Response): Promise<void> => { // <-- FIX: Renamed to AuthenticatedRequest
  try {
    // Items must be retrieved within the user's household context
    const householdId = req.householdId;

    if (!householdId) {
      handleResponse(res, 400, 'Household context is missing from request.');
      return;
    }

    const items = await StoreItem.find({ householdRefId: householdId });

    res.status(200).json({
      status: 'success',
      results: items.length,
      data: {
        storeItems: items,
      },
    });
  } catch (err: any) {
    handleResponse(res, 500, 'Failed to retrieve store items.', { error: err.message });
  }
};

/**
 * Create a new StoreItem for the authenticated user's primary Household.
 */
export const createStoreItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => { // <-- FIX: Renamed to AuthenticatedRequest
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
    const newItem = await StoreItem.create({
      itemName,
      description, // This can now be an empty string
      cost,
      isAvailable,
      householdRefId: householdId, // CRITICAL: Scope item to the Household
    });

    // Emit real-time update
    io.emit('store_item_updated', { type: 'create', storeItem: newItem });

    handleResponse(res, 201, 'Store item created successfully.', newItem);

  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to create store item.',
      error: err.message,
    });
  }
};

/**
 * Get a single StoreItem by ID.
 */
export const getStoreItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => { // <-- FIX: Renamed to AuthenticatedRequest
  try {
    const itemId = req.params.id;
    const householdId = req.householdId;

    // Find the item by ID AND ensure it belongs to the current household
    const item = await StoreItem.findOne({
      _id: itemId,
      householdRefId: householdId,
    });

    if (!item) {
      handleResponse(res, 404, 'Store item not found or does not belong to your household.');
      return;
    }

    handleResponse(res, 200, 'Store item retrieved successfully.', item);

  } catch (err: any) {
    if (err instanceof mongoose.Error.CastError) {
      handleResponse(res, 400, 'Invalid item ID format.');
      return;
    }
    handleResponse(res, 500, 'Failed to retrieve store item.', { error: err.message });
  }
};

/**
 * Update a StoreItem by ID.
 */
export const updateStoreItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => { // <-- FIX: Renamed to AuthenticatedRequest
  try {
    const itemId = req.params.id;
    const householdId = req.householdId;

    // Prevent updating householdRefId via this general update endpoint
    const updates = { ...req.body };
    delete updates.householdRefId;

    // Find the item by ID and household ID, and then update it
    const updatedItem = await StoreItem.findOneAndUpdate(
      {
        _id: itemId,
        householdRefId: householdId,
      },
      updates,
      { new: true, runValidators: true }
    );

    if (!updatedItem) {
      handleResponse(res, 404, 'Store item not found or does not belong to your household.');
      return;
    }

    // Emit real-time update
    io.emit('store_item_updated', { type: 'update', storeItem: updatedItem });

    handleResponse(res, 200, 'Store item updated successfully.', updatedItem);

  } catch (err: any) {
    if (err instanceof mongoose.Error.CastError) {
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

/**
 * Delete a StoreItem by ID.
 */
export const deleteStoreItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => { // <-- FIX: Renamed to AuthenticatedRequest
  try {
    const itemId = req.params.id;
    const householdId = req.householdId;

    // Find the item by ID AND ensure it belongs to the current household before deleting
    const deletedItem = await StoreItem.findOneAndDelete({
      _id: itemId,
      householdRefId: householdId,
    });

    if (!deletedItem) {
      handleResponse(res, 404, 'Store item not found or does not belong to your household.');
      return;
    }

    // Emit real-time update
    io.emit('store_item_updated', { type: 'delete', storeItemId: itemId });

    // Successful deletion returns 204 No Content
    res.status(204).json({
      status: 'success',
      data: null,
    });

  } catch (err: any) {
    if (err instanceof mongoose.Error.CastError) {
      handleResponse(res, 400, 'Invalid item ID format.');
      return;
    }
    handleResponse(res, 500, 'Failed to delete store item.', { error: err.message });
  }
};