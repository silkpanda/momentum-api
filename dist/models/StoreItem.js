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
        required: false,
        default: '',
    },
    cost: {
        type: Number,
        required: true,
        min: 1,
    },
    isAvailable: {
        type: Boolean,
        default: true,
    },
    stock: {
        type: Number,
        required: false,
        min: 0,
    },
    isInfinite: {
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
    collection: 'storeitems',
});
const StoreItem = (0, mongoose_1.model)('StoreItem', StoreItemSchema);
exports.default = StoreItem;
//# sourceMappingURL=StoreItem.js.map