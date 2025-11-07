"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
// Schema definition
const TransactionSchema = new mongoose_1.Schema({
    transactionType: {
        type: String,
        enum: ['TaskCompletion', 'ItemPurchase', 'PointsAdjustment'],
        required: true,
    },
    pointValue: {
        type: Number,
        required: true,
        // Can be positive or negative
    },
    memberRefId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'FamilyMember',
        required: true,
    },
    relatedRefId: {
        type: mongoose_1.Schema.Types.ObjectId,
        // We don't specify a ref here, as it could be either a Task or StoreItem
        required: false,
    },
    householdRefId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Household',
        required: true,
    },
    transactionNote: {
        type: String,
        required: true,
    }
}, {
    timestamps: true,
    collection: 'transactions', // Mandatory lowercase_plural collection name
});
// Mandatory PascalCase Model name
const Transaction = (0, mongoose_1.model)('Transaction', TransactionSchema);
exports.default = Transaction;
//# sourceMappingURL=Transaction.js.map