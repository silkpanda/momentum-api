// silkpanda/momentum-api/momentum-api-556c5b7b5d534751fdc505eedf6113f20a02cc98/src/routes/storeItemRoutes.ts
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
import { purchaseStoreItem } from '../controllers/transactionController'; // <-- NEW IMPORT

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

// Routes for individual item operations (Parent CRUD)
// GET /api/v1/store-items/:id
// PATCH /api/v1/store-items/:id
// DELETE /api/v1/store-items/:id
router.route('/:id')
    .get(getStoreItem)
    .patch(updateStoreItem)
    .delete(deleteStoreItem);

// NEW ROUTE: Item Purchase (Phase 3.4)
// POST /api/v1/store-items/:id/purchase
// This route is NOT restricted to Parent, only requires basic protection.
router.route('/:id/purchase')
    .post(protect, purchaseStoreItem); 

export default router;