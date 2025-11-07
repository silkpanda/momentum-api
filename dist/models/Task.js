"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
// Schema definition
const TaskSchema = new mongoose_1.Schema({
    taskName: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        trim: true,
    },
    pointsValue: {
        type: Number,
        required: true,
        min: 1, // Tasks must give at least 1 point
    },
    recurrence: {
        type: String,
        enum: ['None', 'Daily', 'Weekly'],
        default: 'None',
    },
    assignedToRefs: {
        type: [
            {
                type: mongoose_1.Schema.Types.ObjectId,
                ref: 'FamilyMember',
            },
        ],
        default: [],
        // Using 'assignedToRefs' adheres to the 'camelCase + Ref/Id' naming for array references
    },
    householdRefId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Household',
        required: true,
    },
    isCompleted: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true,
    collection: 'tasks', // Mandatory lowercase_plural collection name
});
// Mandatory PascalCase Model name
const Task = (0, mongoose_1.model)('Task', TaskSchema);
exports.default = Task;
//# sourceMappingURL=Task.js.map