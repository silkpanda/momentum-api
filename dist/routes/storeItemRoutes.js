"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const authController_1 = require("../controllers/authController");
const storeItemController_1 = require("../controllers/storeItemController");
const transactionController_1 = require("../controllers/transactionController");
const router = (0, express_1.Router)();
// 1. All routes require login
router.use(authMiddleware_1.protect);
// 2. Public Routes (Parent & Child)
// Children must see the store to buy things!
router.route('/')
    .get(storeItemController_1.getAllStoreItems)
    .post((0, authController_1.restrictTo)('Parent'), storeItemController_1.createStoreItem); // Only Parents stock the store
router.route('/:id')
    .get(storeItemController_1.getStoreItem)
    .patch((0, authController_1.restrictTo)('Parent'), storeItemController_1.updateStoreItem)
    .delete((0, authController_1.restrictTo)('Parent'), storeItemController_1.deleteStoreItem);
// 3. Purchase Route (Anyone can buy if they have points)
router.route('/:id/purchase')
    .post(transactionController_1.purchaseStoreItem);
exports.default = router;
//# sourceMappingURL=storeItemRoutes.js.map