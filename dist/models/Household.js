"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/models/Household.ts
const mongoose_1 = require("mongoose");
// Sub-schema for the embedded member profile data (camelCase, mandatory fields)
const HouseholdMemberProfileSchema = new mongoose_1.Schema({
    familyMemberId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'FamilyMember',
        required: true,
    },
    displayName: {
        type: String,
        required: true,
    },
    profileColor: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        enum: ['Parent', 'Child'],
        required: true,
    },
    pointsTotal: {
        type: Number,
        default: 0,
    },
    focusedTaskId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Task',
    },
    currentStreak: {
        type: Number,
        default: 0,
    },
    longestStreak: {
        type: Number,
        default: 0,
    },
    lastCompletionDate: {
        type: String,
    },
    streakMultiplier: {
        type: Number,
        default: 1.0,
    },
    isLinkedChild: {
        type: Boolean,
        default: false,
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
    // New Calendar Integration v4
    familyColor: {
        type: String,
        default: '#8B5CF6', // Default to Violet/Purple if not set
    },
    familyCalendarId: {
        type: String,
        default: null,
    },
}, {
    timestamps: true,
    collection: 'households', // Mandatory lowercase_plural collection name
});
// Mandatory PascalCase Model name
const Household = (0, mongoose_1.model)('Household', HouseholdSchema);
exports.default = Household;
//# sourceMappingURL=Household.js.map