"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
// Schema definition
const StoreItemSchema = new mongoose_1.Schema({
    itemName: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        // FIX: Changed from required: true to false
        required: false,
        default: '', // Add default empty string
    },
    cost: {
        type: Number,
        required: true,
        min: 1, // Items must cost at least 1 point
    },
    isAvailable: {
        type: Boolean,
        default: true,
    },
    householdRefId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Household',
        required: true,
    },
}, {
    timestamps: true,
    collection: 'storeitems', // Mandatory lowercase_plural collection name
});
// Mandatory PascalCase Model name
const StoreItem = (0, mongoose_1.model)('StoreItem', StoreItemSchema);
exports.default = StoreItem;
//# sourceMappingURL=StoreItem.js.map