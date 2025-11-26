"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/models/Task.ts
const mongoose_1 = require("mongoose");
const TaskSchema = new mongoose_1.Schema({
    householdId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Household',
        required: true,
        index: true, // Good for performance
    },
    visibleToHouseholds: [{
            type: mongoose_1.Schema.Types.ObjectId,
            ref: 'Household',
        }],
    title: {
        type: String,
        required: [true, 'Task title is required'],
        trim: true,
    },
    description: {
        type: String,
        trim: true,
    },
    pointsValue: {
        type: Number,
        required: [true, 'Points value is required'],
        min: 0,
    },
    // --- THIS IS THE UPDATED FIELD ---
    status: {
        type: String,
        enum: ['Pending', 'PendingApproval', 'Approved'], // v4 Status Flow
        default: 'Pending',
        required: true,
    },
    // --- END OF UPDATE ---
    assignedTo: [
        {
            type: mongoose_1.Schema.Types.ObjectId, // Refers to the Household.memberProfiles._id
            required: true,
        },
    ],
    completedBy: {
        type: mongoose_1.Schema.Types.ObjectId, // Refers to the Household.memberProfiles._id
    },
    dueDate: {
        type: Date,
    },
    isRecurring: {
        type: Boolean,
        default: false,
    },
    recurrenceInterval: {
        type: String,
        enum: ['daily', 'weekly', 'monthly'],
    },
}, {
    timestamps: true, // Manages createdAt and updatedAt
    collection: 'tasks', // Governance: lowercase_plural
});
// Mandatory PascalCase Model name
const Task = (0, mongoose_1.model)('Task', TaskSchema);
exports.default = Task;
//# sourceMappingURL=Task.js.map