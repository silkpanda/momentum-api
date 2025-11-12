"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMe = exports.restrictTo = exports.login = exports.signup = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const FamilyMember_1 = __importDefault(require("../models/FamilyMember"));
const Household_1 = __importDefault(require("../models/Household"));
const constants_1 = require("../config/constants");
// Helper function to generate a JWT (used by both signup and login)
const signToken = (id, householdRefId) => {
    // Payload contains the user ID and their primary household context
    const payload = { id, householdRefId };
    // Options object containing the expiration time
    const options = {
        // FIX APPLIED: Type cast JWT_EXPIRES_IN to 'any' to bypass TS type mismatch
        expiresIn: constants_1.JWT_EXPIRES_IN,
    };
    // Use the synchronous version of sign(payload, secret, options)
    return jsonwebtoken_1.default.sign(payload, constants_1.JWT_SECRET, options);
};
// -----------------------------------------------------------------------------
// 1. Authentication Controllers (Login/Signup)
// -----------------------------------------------------------------------------
/**
 * Controller function to handle Parent Sign-Up (Phase 2.1)
 * ... (No change) ...
 */
const signup = async (req, res) => {
    try {
        const { firstName, email, password } = req.body;
        if (!firstName || !email || !password) {
            res.status(400).json({ status: 'fail', message: 'Missing mandatory fields: firstName, email, and password.' });
            return;
        }
        // 1. Create the Parent FamilyMember document
        // The password will be hashed by the 'pre-save' hook in the FamilyMember model.
        const newParent = await FamilyMember_1.default.create({
            firstName,
            email,
            role: 'Parent', // Mandatory role assignment
            password: password, // Pass the PLAIN-TEXT password to the model
            householdRefs: [], // Temporarily empty
        });
        // Explicitly assert the _id type to Types.ObjectId to resolve 'unknown'
        const parentId = newParent._id;
        // 3. Create the initial Household
        const newHousehold = await Household_1.default.create({
            householdName: `${firstName}'s Household`,
            parentRefs: [parentId], // Link the new parent immediately
            childProfiles: [], // Start with no children
        });
        // Explicitly assert the _id type to Types.ObjectId to resolve 'unknown'
        const householdId = newHousehold._id;
        // 4. Update the Parent's FamilyMember document with the new Household reference
        // We use parentId.toString() here to ensure the ID is a plain string for the query
        await FamilyMember_1.default.findByIdAndUpdate(parentId.toString(), {
            $push: { householdRefs: householdId }
        });
        // 5. Generate and return JWT (Parent is automatically logged in)
        const token = signToken(parentId.toString(), householdId.toString());
        // Successful response
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
            res.status(409).json({
                status: 'fail',
                message: 'This email address is already registered.',
            });
            return;
        }
        res.status(500).json({
            status: 'error',
            message: 'Failed to create user or household.',
            error: err.message,
        });
    }
};
exports.signup = signup;
/**
 * Controller function to handle Parent Login (Phase 2.1)
 * ... (No change) ...
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ status: 'fail', message: 'Please provide email and password.' });
            return;
        }
        // 1. Find user by email and explicitly select the password field
        const parent = await FamilyMember_1.default.findOne({ email }).select('+password');
        // 2. Check if user exists and password is correct
        // We also check for 'Parent' role for security and compliance with auth design.
        const isPasswordCorrect = parent && parent.role === 'Parent' && (await parent.comparePassword(password));
        if (!isPasswordCorrect) {
            res.status(401).json({
                status: 'fail',
                message: 'Incorrect email or password.',
            });
            return;
        }
        // CRITICAL: The Parent must belong to at least one household (created during signup)
        const primaryHouseholdId = parent.householdRefs[0];
        // 3. Generate JWT (Parent is now logged in)
        // FIX APPLIED: Explicitly cast parent._id and primaryHouseholdId to Types.ObjectId 
        const token = signToken(parent._id.toString(), primaryHouseholdId.toString());
        // Successful response
        res.status(200).json({
            status: 'success',
            token,
            data: {
                parent,
            },
        });
    }
    catch (err) {
        res.status(500).json({
            status: 'error',
            message: 'Login failed.',
            error: err.message,
        });
    }
};
exports.login = login;
// -----------------------------------------------------------------------------
// 2. Authorization Middleware (Restrict by Role) - NEW FUNCTION
// -----------------------------------------------------------------------------
// Factory function that returns the actual middleware
const restrictTo = (...roles) => {
    return (req, res, next) => {
        // req.user is guaranteed to exist here because this middleware runs AFTER 'protect'
        if (!req.user || !roles.includes(req.user.role)) {
            res.status(403).json({
                status: 'fail',
                message: 'You do not have permission to perform this action.',
            });
            return;
        }
        // User has the correct role, grant access
        next();
    };
};
exports.restrictTo = restrictTo;
// Example protected route for testing (will be moved later)
const getMe = (req, res) => {
    res.status(200).json({
        status: 'success',
        data: {
            user: req.user,
            householdId: req.householdId,
        },
    });
};
exports.getMe = getMe;
//# sourceMappingURL=authController.js.map