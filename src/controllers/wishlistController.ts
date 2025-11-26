// =========================================================
// momentum-api/src/controllers/wishlistController.ts
// Wishlist Management - CRUD operations for wishlist items
// =========================================================
import { Request, Response } from 'express';
import WishlistItem from '../models/WishlistItem';
import Household from '../models/Household';
// import { io } from '../server'; // REMOVED to avoid circular dependency

// Get all wishlist items for a member
export const getMemberWishlist = async (req: Request, res: Response) => {
    try {
        const { memberId } = req.params;
        const { includePurchased } = req.query;

        const query: any = { memberId };

        // By default, only show unpurchased items
        if (includePurchased !== 'true') {
            query.isPurchased = false;
        }

        const wishlistItems = await WishlistItem.find(query)
            .sort({ priority: -1, createdAt: -1 }); // High priority first, then newest

        // Get member's current points to calculate progress
        const household = await Household.findOne({ 'memberProfiles._id': memberId });
        const member = household?.memberProfiles.find((m: any) => m._id?.toString() === memberId);
        const currentPoints = member?.pointsTotal || 0;

        // Add progress calculation to each item
        const itemsWithProgress = wishlistItems.map(item => ({
            ...item.toObject(),
            progress: Math.min(100, Math.round((currentPoints / item.pointsCost) * 100)),
            canAfford: currentPoints >= item.pointsCost
        }));

        res.json({
            success: true,
            data: {
                wishlistItems: itemsWithProgress,
                currentPoints
            }
        });
    } catch (error: any) {
        console.error('Error fetching wishlist:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch wishlist',
            error: error.message
        });
    }
};

// Get all wishlist items for a household
export const getHouseholdWishlist = async (req: Request, res: Response) => {
    try {
        const { householdId } = req.params;
        const { includePurchased } = req.query;

        const query: any = { householdId };

        // By default, only show unpurchased items
        if (includePurchased !== 'true') {
            query.isPurchased = false;
        }

        const wishlistItems = await WishlistItem.find(query)
            .sort({ priority: -1, createdAt: -1 });

        // We need to calculate progress for each item, which depends on the member's points.
        // Fetch the household to get all members' points at once.
        const household = await Household.findById(householdId);

        if (!household) {
            return res.status(404).json({
                success: false,
                message: 'Household not found'
            });
        }

        // Create a map of memberId -> points for O(1) lookup
        const memberPointsMap = new Map<string, number>();
        household.memberProfiles.forEach((m: any) => {
            memberPointsMap.set(m._id.toString(), m.pointsTotal || 0);
        });

        const itemsWithProgress = wishlistItems.map(item => {
            const currentPoints = memberPointsMap.get(item.memberId.toString()) || 0;
            return {
                ...item.toObject(),
                progress: Math.min(100, Math.round((currentPoints / item.pointsCost) * 100)),
                canAfford: currentPoints >= item.pointsCost
            };
        });

        res.json({
            success: true,
            data: {
                wishlistItems: itemsWithProgress
            }
        });
    } catch (error: any) {
        console.error('Error fetching household wishlist:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch household wishlist',
            error: error.message
        });
    }
};

// Create a new wishlist item
export const createWishlistItem = async (req: Request, res: Response) => {
    try {
        const { memberId, householdId, title, description, pointsCost, imageUrl, priority } = req.body;

        // Validation
        if (!memberId || !householdId || !title || !pointsCost) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: memberId, householdId, title, pointsCost'
            });
        }

        if (pointsCost < 0) {
            return res.status(400).json({
                success: false,
                message: 'Points cost must be positive'
            });
        }

        // Verify member exists in household
        const household = await Household.findById(householdId);
        if (!household) {
            return res.status(404).json({
                success: false,
                message: 'Household not found'
            });
        }

        const memberExists = household.memberProfiles.some((m: any) => m._id?.toString() === memberId);
        if (!memberExists) {
            return res.status(404).json({
                success: false,
                message: 'Member not found in household'
            });
        }

        // Create wishlist item
        const wishlistItem = new WishlistItem({
            memberId,
            householdId,
            title,
            description,
            pointsCost,
            imageUrl,
            priority: priority || 'medium',
            isPurchased: false
        });

        await wishlistItem.save();

        // Emit WebSocket event
        // Emit WebSocket event
        const io = req.app.get('io');
        io.to(householdId).emit('wishlist_updated', {
            action: 'created',
            wishlistItem: wishlistItem.toObject()
        });

        res.status(201).json({
            success: true,
            data: { wishlistItem }
        });
    } catch (error: any) {
        console.error('Error creating wishlist item:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create wishlist item',
            error: error.message
        });
    }
};

// Update a wishlist item
export const updateWishlistItem = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { title, description, pointsCost, imageUrl, priority } = req.body;

        const wishlistItem = await WishlistItem.findById(id);
        if (!wishlistItem) {
            return res.status(404).json({
                success: false,
                message: 'Wishlist item not found'
            });
        }

        // Update fields
        if (title !== undefined) wishlistItem.title = title;
        if (description !== undefined) wishlistItem.description = description;
        if (pointsCost !== undefined) {
            if (pointsCost < 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Points cost must be positive'
                });
            }
            wishlistItem.pointsCost = pointsCost;
        }
        if (imageUrl !== undefined) wishlistItem.imageUrl = imageUrl;
        if (priority !== undefined) wishlistItem.priority = priority;

        await wishlistItem.save();

        // Emit WebSocket event
        // Emit WebSocket event
        const io = req.app.get('io');
        io.to(wishlistItem.householdId.toString()).emit('wishlist_updated', {
            action: 'updated',
            wishlistItem: wishlistItem.toObject()
        });

        res.json({
            success: true,
            data: { wishlistItem }
        });
    } catch (error: any) {
        console.error('Error updating wishlist item:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update wishlist item',
            error: error.message
        });
    }
};

// Delete a wishlist item
export const deleteWishlistItem = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const wishlistItem = await WishlistItem.findById(id);
        if (!wishlistItem) {
            return res.status(404).json({
                success: false,
                message: 'Wishlist item not found'
            });
        }

        const householdId = wishlistItem.householdId.toString();
        await WishlistItem.findByIdAndDelete(id);

        // Emit WebSocket event
        // Emit WebSocket event
        const io = req.app.get('io');
        io.to(householdId).emit('wishlist_updated', {
            action: 'deleted',
            wishlistItemId: id
        });

        res.json({
            success: true,
            message: 'Wishlist item deleted successfully'
        });
    } catch (error: any) {
        console.error('Error deleting wishlist item:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete wishlist item',
            error: error.message
        });
    }
};

// Mark wishlist item as purchased
export const markWishlistItemPurchased = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const wishlistItem = await WishlistItem.findById(id);
        if (!wishlistItem) {
            return res.status(404).json({
                success: false,
                message: 'Wishlist item not found'
            });
        }

        if (wishlistItem.isPurchased) {
            return res.status(400).json({
                success: false,
                message: 'Wishlist item already marked as purchased'
            });
        }

        // Get member's current points
        const household = await Household.findOne({ 'memberProfiles._id': wishlistItem.memberId });
        const member = household?.memberProfiles.find((m: any) => m._id?.toString() === wishlistItem.memberId.toString());

        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Member not found'
            });
        }

        const currentPoints = member.pointsTotal || 0;
        if (currentPoints < wishlistItem.pointsCost) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient points to purchase this item',
                data: {
                    required: wishlistItem.pointsCost,
                    current: currentPoints,
                    needed: wishlistItem.pointsCost - currentPoints
                }
            });
        }

        // Mark as purchased
        wishlistItem.isPurchased = true;
        wishlistItem.purchasedAt = new Date();
        await wishlistItem.save();

        // Deduct points from member
        member.pointsTotal = currentPoints - wishlistItem.pointsCost;
        await household?.save();

        // Emit WebSocket event
        // Emit WebSocket event
        const io = req.app.get('io');
        io.to(wishlistItem.householdId.toString()).emit('wishlist_updated', {
            action: 'purchased',
            wishlistItem: wishlistItem.toObject()
        });

        io.to(wishlistItem.householdId.toString()).emit('memberUpdated', {
            memberId: wishlistItem.memberId.toString(),
            pointsTotal: member.pointsTotal
        });

        res.json({
            success: true,
            data: {
                wishlistItem,
                newPointsTotal: member.pointsTotal
            }
        });
    } catch (error: any) {
        console.error('Error marking wishlist item as purchased:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark wishlist item as purchased',
            error: error.message
        });
    }
};
