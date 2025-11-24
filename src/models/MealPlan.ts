import { Schema, model, Document, Types } from 'mongoose';

export interface IMealPlan extends Document {
    householdId: Types.ObjectId;
    date: Date;
    mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
    itemType: 'Recipe' | 'Restaurant' | 'Custom';
    itemId?: Types.ObjectId; // Ref to Recipe or Restaurant
    customTitle?: string; // If itemType is Custom
    createdAt: Date;
    updatedAt: Date;
    weeklyMealPlanId?: Types.ObjectId;
}

const MealPlanSchema = new Schema<IMealPlan>(
    {
        householdId: {
            type: Schema.Types.ObjectId,
            ref: 'Household',
            required: true,
        },
        date: {
            type: Date,
            required: true,
        },
        mealType: {
            type: String,
            enum: ['Breakfast', 'Lunch', 'Dinner', 'Snack'],
            required: true,
        },
        itemType: {
            type: String,
            enum: ['Recipe', 'Restaurant', 'Custom'],
            required: true,
        },
        itemId: {
            type: Schema.Types.ObjectId,
            refPath: 'itemType', // Dynamic reference
        },
        customTitle: {
            type: String,
            trim: true,
        },
        weeklyMealPlanId: {
            type: Schema.Types.ObjectId,
            ref: 'WeeklyMealPlan',
            required: false,
        },
    },
    {
        timestamps: true,
    }
);

// Compound index to prevent duplicates (same meal type on same day)?
// Maybe we allow multiple items per meal (e.g. Main + Side).
// For now, let's not enforce uniqueness, but we'll index for efficient querying.
MealPlanSchema.index({ householdId: 1, date: 1 });

const MealPlan = model<IMealPlan>('MealPlan', MealPlanSchema);
export default MealPlan;
