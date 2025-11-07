"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
// Sub-schema for the embedded member profile data (camelCase, mandatory fields)
const HouseholdMemberProfileSchema = new mongoose_1.Schema({
    memberRefId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'FamilyMember', // Reference to the actual user profile
        required: true,
        // Object References must use camelCase + Id suffix (e.g., memberRefId)
    },
    profileColor: {
        type: String,
        required: true,
    },
    pointsTotal: {
        type: Number,
        default: 0,
        min: 0,
    },
}, { _id: false }); // No separate _id needed for embedded sub-documents
// Household Schema definition
const HouseholdSchema = new mongoose_1.Schema({
    householdName: {
        type: String,
        required: true,
        trim: true,
    },
    parentRefs: {
        // Parents have a simple 1:N reference array.
        type: [
            {
                type: mongoose_1.Schema.Types.ObjectId,
                ref: 'FamilyMember',
            },
        ],
        required: true, // Must have at least one parent
    },
    // The core list of children with their Household-specific data
    childProfiles: {
        type: [HouseholdMemberProfileSchema],
        default: [],
    },
}, {
    timestamps: true,
    collection: 'households', // Mandatory lowercase_plural collection name
});
// Mandatory PascalCase Model name
const Household = (0, mongoose_1.model)('Household', HouseholdSchema);
exports.default = Household;
//# sourceMappingURL=Household.js.map