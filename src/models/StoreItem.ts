import { Schema, model, Document, Types } from 'mongoose';

// Interface for the StoreItem document
export interface IStoreItem extends Document {
  itemName: string;
  description: string;
  cost: number;
  isAvailable: boolean;
  // CRITICAL: Links the item to the Household context
  householdRefId: Types.ObjectId;
}

// Schema definition
const StoreItemSchema = new Schema<IStoreItem>(
  {
    itemName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
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
      type: Schema.Types.ObjectId,
      ref: 'Household',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'storeitems', // Mandatory lowercase_plural collection name
  },
);

// Mandatory PascalCase Model name
const StoreItem = model<IStoreItem>('StoreItem', StoreItemSchema);

export default StoreItem;