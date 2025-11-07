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

// Mandatory camelCase variable name for the Router instance
const router = Router();

// Only Parents can manage (CRUD) store items.
router.use(protect, restrictTo('Parent'));

// Routes for getting all items and creating a new item
// GET /api/v1/store-items
// POST /api/v1/store-items
router.route('/')
    .get(getAllStoreItems)
    .post(createStoreItem);

// Routes for individual item operations
// GET /api/v1/store-items/:id
// PATCH /api/v1/store-items/:id
// DELETE /api/v1/store-items/:id
router.route('/:id')
    .get(getStoreItem)
    .patch(updateStoreItem)
    .delete(deleteStoreItem);

export default router;