"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/models/FamilyMember.ts
const mongoose_1 = require("mongoose");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const constants_1 = require("../config/constants");
// Sub-schemas
const HouseholdSpecificDataSchema = new mongoose_1.Schema({
    points: {
        type: Number,
        default: 0,
    },
    xp: {
        type: Number,
        default: 0,
    },
    currentStreak: {
        type: Number,
        default: 0,
    },
    streakLastUpdated: {
        type: Date,
        default: Date.now,
    },
}, { _id: false });
const LinkedHouseholdSchema = new mongoose_1.Schema({
    householdId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Household',
        required: true,
    },
    linkCode: {
        type: String,
        required: true,
    },
    linkedAt: {
        type: Date,
        default: Date.now,
    },
    linkedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'FamilyMember',
        required: true,
    },
    householdSpecificData: {
        type: HouseholdSpecificDataSchema,
        default: () => ({}),
    },
}, { _id: false });
const SharedDataSchema = new mongoose_1.Schema({
    points: Number,
    xp: Number,
    currentStreak: Number,
    streakLastUpdated: Date,
}, { _id: false });
// Schema definition
const FamilyMemberSchema = new mongoose_1.Schema({
    firstName: {
        type: String,
        required: [true, 'First name is required'],
        trim: true,
    },
    lastName: {
        type: String,
        required: [true, 'Last name is required'],
        trim: true,
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        trim: true,
        lowercase: true,
        // Simple email validation
        match: [/.+@.+\..+/, 'Please enter a valid email address'],
    },
    // The Hashed Password
    password: {
        type: String,
        required: [true, 'Password is required'],
        select: false, // Ensures hash is not retrieved by default queries
        minlength: 8,
    },
    passwordChangedAt: Date, // Tracks last password update
    // PIN Authentication fields
    pin: {
        type: String,
        select: false, // Ensures hash is not retrieved by default queries
    },
    pinSetupCompleted: {
        type: Boolean,
        default: false,
    },
    lastPinVerification: Date,
    // Multi-household support
    linkedHouseholds: [LinkedHouseholdSchema],
    sharedData: SharedDataSchema,
    // Google Calendar Integration
    googleCalendar: {
        accessToken: String,
        refreshToken: String,
        expiryDate: Number,
    },
    // REMOVED 'role' and 'householdRefs' as they are no longer global.
    // Role and points are now managed *inside* the Household model.
}, {
    timestamps: true,
    collection: 'familymembers', // Governance: lowercase_plural
});
// Pre-save hook to hash the password and PIN before saving
FamilyMemberSchema.pre('save', async function (next) {
    // Hash password if modified
    if (this.isModified('password')) {
        this.password = await bcryptjs_1.default.hash(this.password, constants_1.BCRYPT_SALT_ROUNDS);
        // Update the password change timestamp (used for invalidating old JWTs)
        // Set it 1 second in the past to ensure JWT is created *after* this timestamp
        this.passwordChangedAt = new Date(Date.now() - 1000);
    }
    // Hash PIN if modified
    if (this.isModified('pin') && this.pin) {
        this.pin = await bcryptjs_1.default.hash(this.pin, constants_1.BCRYPT_SALT_ROUNDS);
    }
    next();
});
// Instance method to compare candidate password with the stored hash
FamilyMemberSchema.methods.comparePassword = async function (candidatePassword) {
    // 'this.password' is not available here if 'select: false' is active
    // But since we are calling this method on a user doc where we *expect*
    // to check the password, we assume the query explicitly selected it.
    // Handle case where password might not be selected (though it should be)
    if (!this.password) {
        // To be safe, re-fetch the document with the password
        const user = await (0, mongoose_1.model)('FamilyMember').findById(this._id).select('+password');
        if (!user || !user.password)
            return false;
        return bcryptjs_1.default.compare(candidatePassword, user.password);
    }
    return bcryptjs_1.default.compare(candidatePassword, this.password);
};
// Instance method to compare candidate PIN with the stored hash
FamilyMemberSchema.methods.comparePin = async function (candidatePin) {
    // Handle case where PIN might not be selected
    if (!this.pin) {
        // Re-fetch the document with the PIN
        const user = await (0, mongoose_1.model)('FamilyMember').findById(this._id).select('+pin');
        if (!user || !user.pin)
            return false;
        return bcryptjs_1.default.compare(candidatePin, user.pin);
    }
    return bcryptjs_1.default.compare(candidatePin, this.pin);
};
// Mandatory PascalCase Model name
const FamilyMember = (0, mongoose_1.model)('FamilyMember', FamilyMemberSchema);
exports.default = FamilyMember;
//# sourceMappingURL=FamilyMember.js.map