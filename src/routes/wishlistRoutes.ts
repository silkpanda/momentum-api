// =========================================================
// momentum-api/src/routes/wishlistRoutes.ts
// Wishlist API Routes
// =========================================================
import express from 'express';
import {
    getMemberWishlist,
    getHouseholdWishlist,
    createWishlistItem,
    updateWishlistItem,
    deleteWishlistItem,
    markWishlistItemPurchased
} from '../controllers/wishlistController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Get household's wishlist (Optimized)
router.get('/household/:householdId', getHouseholdWishlist);

// Get member's wishlist
router.get('/member/:memberId', getMemberWishlist);

// Create wishlist item
router.post('/', createWishlistItem);

// Update wishlist item
router.put('/:id', updateWishlistItem);

// Delete wishlist item
router.delete('/:id', deleteWishlistItem);

// Mark wishlist item as purchased
router.post('/:id/purchase', markWishlistItemPurchased);

export default router;
