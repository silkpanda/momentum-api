"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/models/FamilyMember.ts
const mongoose_1 = require("mongoose");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const constants_1 = require("../config/constants");
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
    // REMOVED 'role' and 'householdRefs' as they are no longer global.
    // Role and points are now managed *inside* the Household model.
}, {
    timestamps: true,
    collection: 'familymembers', // Governance: lowercase_plural
});
// Pre-save hook to hash the password before saving
FamilyMemberSchema.pre('save', async function (next) {
    // Only run this function if password was actually modified
    if (!this.isModified('password'))
        return next();
    // Hash the password with cost factor
    this.password = await bcryptjs_1.default.hash(this.password, constants_1.BCRYPT_SALT_ROUNDS);
    // Update the password change timestamp (used for invalidating old JWTs)
    // Set it 1 second in the past to ensure JWT is created *after* this timestamp
    this.passwordChangedAt = new Date(Date.now() - 1000);
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
// Mandatory PascalCase Model name
const FamilyMember = (0, mongoose_1.model)('FamilyMember', FamilyMemberSchema);
exports.default = FamilyMember;
//# sourceMappingURL=FamilyMember.js.map