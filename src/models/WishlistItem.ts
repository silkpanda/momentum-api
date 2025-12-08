// =========================================================
// momentum-api/src/models/WishlistItem.ts
// Wishlist Item Model - Tracks items members are saving for
// =========================================================
import mongoose, { Schema, Document } from 'mongoose';

export interface IWishlistItem extends Document {
    memberId: mongoose.Types.ObjectId;
    householdId: mongoose.Types.ObjectId;
    title: string;
    description?: string;
    pointsCost: number;
    imageUrl?: string;
    priority: 'low' | 'medium' | 'high';
    isPurchased: boolean;
    purchasedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const WishlistItemSchema: Schema = new Schema(
    {
        memberId: {
            type: Schema.Types.ObjectId,
            ref: 'Household.members',
            required: true,
            index: true
        },
        householdId: {
            type: Schema.Types.ObjectId,
            ref: 'Household',
            required: true,
            index: true
        },
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },
        description: {
            type: String,
            trim: true,
            maxlength: 500
        },
        pointsCost: {
            type: Number,
            required: true,
            min: 0
        },
        imageUrl: {
            type: String,
            trim: true
        },
        priority: {
            type: String,
            enum: ['low', 'medium', 'high'],
            default: 'medium'
        },
        isPurchased: {
            type: Boolean,
            default: false
        },
        purchasedAt: {
            type: Date
        }
    },
    {
        timestamps: true
    }
);

// Indexes for efficient queries
WishlistItemSchema.index({ memberId: 1, isPurchased: 1 });
WishlistItemSchema.index({ householdId: 1 });

// Virtual for progress calculation (requires member's current points)
WishlistItemSchema.virtual('progress').get(function (this: IWishlistItem) {
    // This will be calculated in the controller with member's current points
    return 0;
});

export default mongoose.model<IWishlistItem>('WishlistItem', WishlistItemSchema);
