"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.protect = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const express_async_handler_1 = __importDefault(require("express-async-handler")); // Required for protect function
const FamilyMember_1 = __importDefault(require("../models/FamilyMember"));
const AppError_1 = __importDefault(require("../utils/AppError"));
const mongoose_1 = require("mongoose");
const constants_1 = require("../config/constants"); // Import JWT_SECRET
// Middleware function to protect routes
exports.protect = (0, express_async_handler_1.default)(async (req, res, next) => {
    let token;
    // 1. Get token and check if it exists
    if (req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
        return next(new AppError_1.default('You are not logged in! Please log in to get access.', 401));
    }
    // 2. Verification token
    const decoded = jsonwebtoken_1.default.verify(token, constants_1.JWT_SECRET);
    // 3. Check if user still exists
    // The decoded token ID is the FamilyMember ID
    const currentUser = await FamilyMember_1.default.findById(decoded.id);
    if (!currentUser) {
        return next(new AppError_1.default('The user belonging to this token no longer exists.', 401));
    }
    // 4. Check if user changed password after the token was issued 
    if (currentUser.passwordChangedAt) {
        const passwordChangedTimestamp = currentUser.passwordChangedAt.getTime() / 1000;
        // JWT payload 'iat' (issued at) is in seconds
        if (passwordChangedTimestamp > decoded.iat) {
            return next(new AppError_1.default('User recently changed password! Please log in again.', 401));
        }
    }
    // GRANT ACCESS TO PROTECTED ROUTE
    // Attach the user document and household context to the request
    req.user = currentUser;
    req.householdId = new mongoose_1.Types.ObjectId(decoded.householdId); // Attach household context
    next();
});
//# sourceMappingURL=authMiddleware.js.map