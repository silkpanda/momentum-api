"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.protect = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongoose_1 = require("mongoose");
const FamilyMember_1 = __importDefault(require("../models/FamilyMember"));
const constants_1 = require("../config/constants");
// -----------------------------------------------------------------------------
// 1. JWT Protection Middleware (Auth Guard)
// -----------------------------------------------------------------------------
const protect = async (req, res, next) => {
    try {
        let token;
        // 1. Get token and check if it exists
        if (req.headers.authorization &&
            req.headers.authorization.startsWith('Bearer')) {
            // Example: 'Bearer tokenValue' -> ['Bearer', 'tokenValue']
            token = req.headers.authorization.split(' ')[1];
        }
        if (!token) {
            res.status(401).json({
                status: 'fail',
                message: 'You are not logged in. Please log in to get access.',
            });
            return;
        }
        // 2. Verification token
        // The jwt.verify returns the payload if verification succeeds.
        const decoded = jsonwebtoken_1.default.verify(token, constants_1.JWT_SECRET);
        // The JWT payload contains the user ID ('id') and their primary household context ('householdRefId')
        const { id: userId, householdRefId } = decoded;
        // 3. Check if user still exists
        // We explicitly exclude the password since it's sensitive.
        const currentUser = await FamilyMember_1.default.findById(userId);
        if (!currentUser) {
            res.status(401).json({
                status: 'fail',
                message: 'The user belonging to this token no longer exists.',
            });
            return;
        }
        // 4. Grant access to protected route
        // Inject user and household ID into the request object for downstream controllers
        req.user = currentUser;
        // FIX APPLIED: Use the constructor to convert string to ObjectId cleanly
        req.householdId = new mongoose_1.Types.ObjectId(householdRefId);
        next();
    }
    catch (err) {
        // Handle specific JWT errors (e.g., expired, invalid signature)
        let message = 'Invalid token.';
        if (err.name === 'TokenExpiredError') {
            message = 'Your token has expired. Please log in again.';
        }
        else if (err.name === 'JsonWebTokenError') {
            message = 'Invalid token signature.';
        }
        res.status(401).json({
            status: 'fail',
            message: message,
        });
    }
};
exports.protect = protect;
//# sourceMappingURL=authMiddleware.js.map