import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import { restrictTo } from '../controllers/authController';
import {
  createStoreItem,
  getAllStoreItems,
  getStoreItem,
  updateStoreItem,
  deleteStoreItem,
} from '../controllers/storeItemController';
import { purchaseStoreItem } from '../controllers/transactionController';

const router = Router();

// 1. All routes require login
router.use(protect);

// 2. Public Routes (Parent & Child)
// Children must see the store to buy things!
router.route('/')
    .get(getAllStoreItems)
    .post(restrictTo('Parent'), createStoreItem); // Only Parents stock the store

router.route('/:id')
    .get(getStoreItem)
    .patch(restrictTo('Parent'), updateStoreItem)
    .delete(restrictTo('Parent'), deleteStoreItem);

// 3. Purchase Route (Anyone can buy if they have points)
router.route('/:id/purchase')
    .post(purchaseStoreItem); 

export default router;