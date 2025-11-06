import { Schema, model, Document, Types } from 'mongoose';

// Define transaction types
type TransactionType = 'TaskCompletion' | 'ItemPurchase' | 'PointsAdjustment';

// Interface for the Transaction document
export interface ITransaction extends Document {
  transactionType: TransactionType;
  pointValue: number; // Stored as a signed number (+10 for gain, -50 for loss)
  // The member who performed the action or received the points
  memberRefId: Types.ObjectId; 
  // The specific Task or StoreItem that caused the transaction
  relatedRefId: Types.ObjectId; 
  // CRITICAL: Links the transaction to the Household context
  householdRefId: Types.ObjectId; 
  
  // A brief description of the transaction
  transactionNote: string;
}

// Schema definition
const TransactionSchema = new Schema<ITransaction>(
  {
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
      type: Schema.Types.ObjectId,
      ref: 'FamilyMember',
      required: true,
    },
    relatedRefId: {
      type: Schema.Types.ObjectId,
      // We don't specify a ref here, as it could be either a Task or StoreItem
      required: false, 
    },
    householdRefId: {
      type: Schema.Types.ObjectId,
      ref: 'Household',
      required: true,
    },
    transactionNote: {
      type: String,
      required: true,
    }
  },
  {
    timestamps: true,
    collection: 'transactions', // Mandatory lowercase_plural collection name
  },
);

// Mandatory PascalCase Model name
const Transaction = model<ITransaction>('Transaction', TransactionSchema);

export default Transaction;