"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// silkpanda/momentum-api/momentum-api-556c5b7b5d534751fdc505eedf6113f20a02cc98/src/models/FamilyMember.ts
const mongoose_1 = require("mongoose");
const bcryptjs_1 = __importDefault(require("bcryptjs")); // Import bcryptjs for pre-save hook
const constants_1 = require("../config/constants"); // <-- NEW IMPORT
// Schema definition
const FamilyMemberSchema = new mongoose_1.Schema({
    firstName: {
        type: String,
        required: true,
        trim: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    },
    role: {
        type: String,
        enum: ['Parent', 'Child'],
        required: true,
    },
    // CRITICAL ADDITION: The Hashed Password
    password: {
        type: String,
        required: function () {
            // Only Parents must have a password hash
            return this.role === 'Parent';
        },
        select: false, // Ensures hash is not retrieved by default queries
    },
    passwordChangedAt: Date, // Tracks last password update
    householdRefs: {
        type: [
            {
                type: mongoose_1.Schema.Types.ObjectId,
                ref: 'Household',
            },
        ],
        default: [],
    },
}, {
    timestamps: true,
    collection: 'familymembers',
});
// NEW: Pre-save hook to hash the password before saving
FamilyMemberSchema.pre('save', async function (next) {
    // Only run this function if password was actually modified AND it exists (i.e., it's a Parent)
    if (!this.isModified('password') || !this.password)
        return next();
    // Hash the password with cost factor defined in constants
    this.password = await bcryptjs_1.default.hash(this.password, constants_1.BCRYPT_SALT_ROUNDS);
    // Update the password change timestamp (used for invalidating old JWTs)
    this.passwordChangedAt = new Date(Date.now() - 1000); // 1 second ago to ensure it's before the JWT creation timestamp
    next();
});
// ADDED: Instance method to compare candidate password with the stored hash
FamilyMemberSchema.methods.comparePassword = async function (candidatePassword) {
    // If the password field was not selected, return false immediately
    if (!this.password)
        return false;
    // Use bcrypt to compare the plain text password with the hashed password
    return bcryptjs_1.default.compare(candidatePassword, this.password);
};
// Mandatory PascalCase Model name
const FamilyMember = (0, mongoose_1.model)('FamilyMember', FamilyMemberSchema);
exports.default = FamilyMember;
//# sourceMappingURL=FamilyMember.js.map