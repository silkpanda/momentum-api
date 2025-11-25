"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/models/Household.ts
const mongoose_1 = require("mongoose");
// Sub-schema for the embedded member profile data (camelCase, mandatory fields)
const HouseholdMemberProfileSchema = new mongoose_1.Schema({
    familyMemberId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'FamilyMember', // Reference to the global user
        required: true,
    },
    displayName: {
        type: String,
        required: [true, 'Display name is required'],
        trim: true,
    },
    profileColor: {
        type: String,
        required: [true, 'Profile color is required'],
    },
    role: {
        type: String,
        enum: ['Parent', 'Child'],
        required: [true, 'Member role is required'],
    },
    pointsTotal: {
        type: Number,
        default: 0,
        min: 0,
    },
    focusedTaskId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Task',
        default: null,
    },
    // Streak System fields
    currentStreak: {
        type: Number,
        default: 0,
        min: 0,
    },
    longestStreak: {
        type: Number,
        default: 0,
        min: 0,
    },
    lastCompletionDate: {
        type: String,
        default: null,
    },
    streakMultiplier: {
        type: Number,
        default: 1.0,
        min: 1.0,
    },
}, {
    // This setting ensures Mongoose auto-generates the '_id' for this sub-document
    _id: true
});
// Main Household Schema definition
const HouseholdSchema = new mongoose_1.Schema({
    householdName: {
        type: String,
        required: [true, 'Household name is required'],
        trim: true,
    },
    // The new unified array, replacing the deprecated v2 model
    memberProfiles: {
        type: [HouseholdMemberProfileSchema],
        default: [],
    },
    inviteCode: {
        type: String,
        unique: true,
        sparse: true, // Allows null/undefined to not conflict
    },
}, {
    timestamps: true,
    collection: 'households', // Mandatory lowercase_plural collection name
});
// Mandatory PascalCase Model name
const Household = (0, mongoose_1.model)('Household', HouseholdSchema);
exports.default = Household;
//# sourceMappingURL=Household.js.map