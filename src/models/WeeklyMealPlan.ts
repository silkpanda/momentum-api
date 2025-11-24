import { Schema, model, Document, Types } from 'mongoose';

export interface IWeeklyMealPlan extends Document {
    householdId: Types.ObjectId;
    startDate: Date;
    endDate: Date;
    createdAt: Date;
    updatedAt: Date;
}

const WeeklyMealPlanSchema = new Schema<IWeeklyMealPlan>(
    {
        householdId: {
            type: Schema.Types.ObjectId,
            ref: 'Household',
            required: true,
        },
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

// Index for efficient querying by household
WeeklyMealPlanSchema.index({ householdId: 1, startDate: -1 });

const WeeklyMealPlan = model<IWeeklyMealPlan>('WeeklyMealPlan', WeeklyMealPlanSchema);
export default WeeklyMealPlan;
