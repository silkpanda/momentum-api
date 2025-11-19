import { Schema, model, Document, Types } from 'mongoose';

export interface IRestaurant extends Document {
    householdId: Types.ObjectId;
    name: string;
    cuisine?: string;
    location?: string;
    favoriteOrders: {
        itemName: string;
        forMemberId?: Types.ObjectId;
    }[];
    createdAt: Date;
    updatedAt: Date;
}

const RestaurantSchema = new Schema<IRestaurant>(
    {
        householdId: {
            type: Schema.Types.ObjectId,
            ref: 'Household',
            required: true,
        },
        name: {
            type: String,
            required: [true, 'Restaurant name is required'],
            trim: true,
        },
        cuisine: {
            type: String,
            trim: true,
        },
        location: {
            type: String,
            trim: true,
        },
        favoriteOrders: [
            {
                itemName: { type: String, required: true },
                forMemberId: { type: Schema.Types.ObjectId, ref: 'FamilyMember' },
            },
        ],
    },
    {
        timestamps: true,
    }
);

const Restaurant = model<IRestaurant>('Restaurant', RestaurantSchema);
export default Restaurant;
