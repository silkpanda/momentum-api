import { Schema, model, Document, Types } from 'mongoose';

// Interface for the StoreItem document
export interface IStoreItem extends Document {
  itemName: string;
  description?: string;
  cost: number;
  isAvailable?: boolean;
  stock?: number;
  isInfinite?: boolean;
  householdRefId: Types.ObjectId;
}

// Schema definition
const StoreItemSchema = new Schema<IStoreItem>({
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
    type: Schema.Types.ObjectId,
    ref: 'Household',
    required: true,
  },
}, {
  timestamps: true,
  collection: 'storeitems',
});

const StoreItem = model<IStoreItem>('StoreItem', StoreItemSchema);
export default StoreItem;