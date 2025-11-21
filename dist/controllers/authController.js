"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMe = exports.restrictTo = exports.login = exports.signup = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const FamilyMember_1 = __importDefault(require("../models/FamilyMember"));
const Household_1 = __importDefault(require("../models/Household")); // Import IHouseholdMemberProfile
const constants_1 = require("../config/constants");
const appError_1 = __importDefault(require("../utils/appError"));
const express_async_handler_1 = __importDefault(require("express-async-handler")); // NEW IMPORT for restrictTo
// Helper function to generate a JWT (used by both signup and login)
const signToken = (id, householdId) => {
    // Payload contains the user ID and their *current context* household ID
    const payload = { id, householdId };
    const options = {
        expiresIn: constants_1.JWT_EXPIRES_IN,
    };
    return jsonwebtoken_1.default.sign(payload, constants_1.JWT_SECRET, options);
};
// -----------------------------------------------------------------------------
// 1. Authentication Controllers (Login/Signup)
// -----------------------------------------------------------------------------
/**
 * Controller function to handle Parent Sign-Up (Phase 2.1)
 * Adheres to the new Unified Membership Model (v3)
 */
exports.signup = (0, express_async_handler_1.default)(async (req, res, next) => {
    const { firstName, lastName, email, password } = req.body;
    const { householdName, userDisplayName, userProfileColor } = req.body; // New fields for v3
    if (!firstName || !lastName || !email || !password || !householdName || !userDisplayName || !userProfileColor) {
        return next(new appError_1.default('Missing mandatory fields for signup and initial household profile (firstName, lastName, email, password, householdName, userDisplayName, userProfileColor).', 400));
    }
    try {
        // 1. Create the Parent FamilyMember document (global identity)
        const newParent = await FamilyMember_1.default.create({
            firstName,
            lastName,
            email,
            password, // Hashed by the 'pre-save' hook
        });
        const parentId = newParent._id;
        // 2. Create the initial Parent Profile sub-document for the Household
        const creatorProfile = {
            familyMemberId: parentId,
            displayName: userDisplayName,
            profileColor: userProfileColor,
            role: 'Parent', // The creator is always a Parent
            pointsTotal: 0,
        };
        // 3. Create the initial Household, linking the parent's profile
        const newHousehold = await Household_1.default.create({
            householdName,
            memberProfiles: [creatorProfile], //
        });
        const householdId = newHousehold._id;
        // 4. Generate and return JWT
        const token = signToken(parentId.toString(), householdId.toString());
        res.status(201).json({
            status: 'success',
            token,
            data: {
                parent: newParent,
                household: newHousehold,
            },
        });
    }
    catch (err) {
        // Handle duplicate key error (email already exists)
        if (err.code === 11000) {
            return next(new appError_1.default('This email address is already registered.', 409));
        }
        return next(new appError_1.default(`Failed to create user or household: ${err.message}`, 500));
    }
});
/**
 * Controller function to handle Parent Login (Phase 2.1)
 * Adheres to the new Unified Membership Model (v3)
 */
exports.login = (0, express_async_handler_1.default)(async (req, res, next) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return next(new appError_1.default('Please provide email and password.', 400));
    }
    // 1. Find user by email and explicitly select the password field
    const familyMember = await FamilyMember_1.default.findOne({ email }).select('+password');
    // 2. Check if user exists and password is correct
    const isPasswordCorrect = familyMember && (await familyMember.comparePassword(password));
    if (!isPasswordCorrect) {
        return next(new appError_1.default('Incorrect email or password.', 401));
    }
    // 3. CRITICAL: Find a Household where this FamilyMember is a 'Parent'
    const parentId = familyMember._id;
    const household = await Household_1.default.findOne({
        'memberProfiles.familyMemberId': parentId,
        'memberProfiles.role': 'Parent', //
    });
    if (!household) {
        return next(new appError_1.default('User does not belong to any household as a Parent.', 401));
    }
    // FIX: Explicitly cast _id to resolve 'unknown' type
    const primaryHouseholdId = household._id;
    // 4. Generate JWT
    const token = signToken(parentId.toString(), primaryHouseholdId.toString());
    res.status(200).json({
        status: 'success',
        token,
        data: {
            parent: familyMember,
            primaryHouseholdId,
        },
    });
});
// -----------------------------------------------------------------------------
// 2. Authorization Middleware (Restrict by Role)
// -----------------------------------------------------------------------------
/**
 * Factory function that returns the actual middleware.
 * This MUST run *after* the 'protect' middleware.
 */
const restrictTo = (...roles) => {
    return (0, express_async_handler_1.default)(async (req, res, next) => {
        // 1. Check if user and householdId are attached by 'protect' middleware
        if (!req.user || !req.householdId) {
            return next(new appError_1.default('Role check failed: Missing user or household context from token.', 401));
        }
        // 2. Fetch the household from the database using the ID from the token
        const currentHousehold = await Household_1.default.findById(req.householdId);
        if (!currentHousehold) {
            return next(new appError_1.default('Role check failed: The household associated with your token no longer exists.', 401));
        }
        // 3. Find the user's profile *within* that household
        // FIX APPLIED HERE: Cast req.user!._id to Types.ObjectId
        const userHouseholdProfile = currentHousehold.memberProfiles.find((member) => member.familyMemberId.equals(req.user._id));
        // 4. Check if the profile exists and their role is allowed
        if (!userHouseholdProfile || !roles.includes(userHouseholdProfile.role)) {
            return next(new appError_1.default('You do not have permission to perform this action in this household.', 403));
        }
        // 5. User has the correct role, grant access
        next();
    });
};
exports.restrictTo = restrictTo;
/**
 * Protected route for testing
 */
const getMe = (req, res) => {
    res.status(200).json({
        status: 'success',
        data: {
            user: req.user,
            householdId: req.householdId, // This is the context ID from the JWT
        },
    });
};
exports.getMe = getMe;
//# sourceMappingURL=authController.js.map