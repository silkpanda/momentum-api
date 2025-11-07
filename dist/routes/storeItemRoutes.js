"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// silkpanda/momentum-api/momentum-api-556c5b7b5d534751fdc505eedf6113f20a02cc98/src/routes/storeItemRoutes.ts
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const authController_1 = require("../controllers/authController");
const storeItemController_1 = require("../controllers/storeItemController");
const transactionController_1 = require("../controllers/transactionController"); // <-- NEW IMPORT
// Mandatory camelCase variable name for the Router instance
const router = (0, express_1.Router)();
// Only Parents can manage (CRUD) store items.
router.use(authMiddleware_1.protect, (0, authController_1.restrictTo)('Parent'));
// Routes for getting all items and creating a new item
// GET /api/v1/store-items
// POST /api/v1/store-items
router.route('/')
    .get(storeItemController_1.getAllStoreItems)
    .post(storeItemController_1.createStoreItem);
// Routes for individual item operations (Parent CRUD)
// GET /api/v1/store-items/:id
// PATCH /api/v1/store-items/:id
// DELETE /api/v1/store-items/:id
router.route('/:id')
    .get(storeItemController_1.getStoreItem)
    .patch(storeItemController_1.updateStoreItem)
    .delete(storeItemController_1.deleteStoreItem);
// NEW ROUTE: Item Purchase (Phase 3.4)
// POST /api/v1/store-items/:id/purchase
// This route is NOT restricted to Parent, only requires basic protection.
router.route('/:id/purchase')
    .post(authMiddleware_1.protect, transactionController_1.purchaseStoreItem);
exports.default = router;
//# sourceMappingURL=storeItemRoutes.js.map