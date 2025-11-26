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
const AppError_1 = __importDefault(require("../utils/AppError"));
const express_async_handler_1 = __importDefault(require("express-async-handler"));
const signToken = (id, householdId) => {
    const payload = { id, householdId };
    const options = {
        expiresIn: constants_1.JWT_EXPIRES_IN,
    };
    return jsonwebtoken_1.default.sign(payload, constants_1.JWT_SECRET, options);
};
exports.signup = (0, express_async_handler_1.default)(async (req, res, next) => {
    const { firstName, lastName, email, password } = req.body;
    const { householdName, userDisplayName, userProfileColor, inviteCode } = req.body;
    if (!firstName || !lastName || !email || !password || !userDisplayName || !userProfileColor) {
        return next(new AppError_1.default('Missing mandatory fields (firstName, lastName, email, password, userDisplayName, userProfileColor).', 400));
    }
    if (!inviteCode && !householdName) {
        return next(new AppError_1.default('householdName is required when creating a new household.', 400));
    }
    try {
        const newParent = await FamilyMember_1.default.create({
            firstName,
            lastName,
            email,
            password,
        });
        const parentId = newParent._id;
        let householdId;
        let household;
        if (inviteCode) {
            household = await Household_1.default.findOne({ inviteCode: inviteCode.toUpperCase() });
            if (!household) {
                await FamilyMember_1.default.findByIdAndDelete(parentId);
                return next(new AppError_1.default('Invalid invite code.', 404));
            }
            const isMember = household.memberProfiles.some((p) => p.familyMemberId.toString() === parentId.toString());
            if (isMember) {
                await FamilyMember_1.default.findByIdAndDelete(parentId);
                return next(new AppError_1.default('User is already a member of this household.', 400));
            }
            const newProfile = {
                familyMemberId: parentId,
                displayName: userDisplayName,
                profileColor: userProfileColor,
                role: 'Parent',
                pointsTotal: 0,
            };
            household.memberProfiles.push(newProfile);
            await household.save();
            householdId = household._id;
        }
        else {
            const creatorProfile = {
                familyMemberId: parentId,
                displayName: userDisplayName,
                profileColor: userProfileColor,
                role: 'Parent',
                pointsTotal: 0,
            };
            household = await Household_1.default.create({
                householdName,
                memberProfiles: [creatorProfile],
            });
            householdId = household._id;
        }
        const token = signToken(parentId.toString(), householdId.toString());
        const userWithRole = {
            ...newParent.toObject(),
            role: 'Parent',
        };
        res.status(201).json({
            status: 'success',
            token,
            data: {
                parent: userWithRole,
                household: household,
            },
        });
    }
    catch (err) {
        if (err.code === 11000) {
            return next(new AppError_1.default('This email address is already registered.', 409));
        }
        return next(new AppError_1.default(`Failed to create user or household: ${err.message}`, 500));
    }
});
exports.login = (0, express_async_handler_1.default)(async (req, res, next) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return next(new AppError_1.default('Please provide email and password.', 400));
    }
    const familyMember = await FamilyMember_1.default.findOne({ email }).select('+password');
    const isPasswordCorrect = familyMember && (await familyMember.comparePassword(password));
    if (!isPasswordCorrect) {
        return next(new AppError_1.default('Incorrect email or password.', 401));
    }
    const parentId = familyMember._id;
    const household = await Household_1.default.findOne({
        'memberProfiles.familyMemberId': parentId,
        'memberProfiles.role': 'Parent',
    });
    if (!household) {
        return next(new AppError_1.default('User does not belong to any household as a Parent.', 401));
    }
    const primaryHouseholdId = household._id;
    const token = signToken(parentId.toString(), primaryHouseholdId.toString());
    const userWithRole = {
        ...familyMember.toObject(),
        role: 'Parent',
    };
    res.status(200).json({
        status: 'success',
        token,
        data: {
            parent: userWithRole,
            primaryHouseholdId,
        },
    });
});
const restrictTo = (...roles) => {
    return (0, express_async_handler_1.default)(async (req, res, next) => {
        if (!req.user || !req.householdId) {
            return next(new AppError_1.default('Role check failed: Missing user or household context from token.', 401));
        }
        const currentHousehold = await Household_1.default.findById(req.householdId);
        if (!currentHousehold) {
            return next(new AppError_1.default('Role check failed: The household associated with your token no longer exists.', 401));
        }
        const userHouseholdProfile = currentHousehold.memberProfiles.find((member) => member.familyMemberId.equals(req.user._id));
        if (!userHouseholdProfile || !roles.includes(userHouseholdProfile.role)) {
            return next(new AppError_1.default('You do not have permission to perform this action in this household.', 403));
        }
        next();
    });
};
exports.restrictTo = restrictTo;
exports.getMe = (0, express_async_handler_1.default)(async (req, res, next) => {
    if (!req.user || !req.householdId) {
        return next(new AppError_1.default('Not authenticated.', 401));
    }
    const household = await Household_1.default.findById(req.householdId);
    if (!household) {
        return next(new AppError_1.default('Household not found.', 404));
    }
    const memberProfile = household.memberProfiles.find((member) => member.familyMemberId.toString() === req.user._id.toString());
    const userWithRole = {
        ...req.user.toObject(),
        role: memberProfile?.role || 'Child',
    };
    res.status(200).json({
        status: 'success',
        data: {
            user: userWithRole,
            householdId: req.householdId,
        },
    });
});
//# sourceMappingURL=authController.js.map