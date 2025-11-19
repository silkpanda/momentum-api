import { Schema, model, Document, Types } from 'mongoose';

export interface IRecipe extends Document {
    householdId: Types.ObjectId;
    name: string;
    description?: string;
    ingredients: string[];
    instructions: string[];
    prepTimeMinutes?: number;
    cookTimeMinutes?: number;
    image?: string; // Icon name or URL
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
}

const RecipeSchema = new Schema<IRecipe>(
    {
        householdId: {
            type: Schema.Types.ObjectId,
            ref: 'Household',
            required: true,
        },
        name: {
            type: String,
            required: [true, 'Recipe name is required'],
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        ingredients: {
            type: [String],
            default: [],
        },
        instructions: {
            type: [String],
            default: [],
        },
        prepTimeMinutes: {
            type: Number,
            min: 0,
        },
        cookTimeMinutes: {
            type: Number,
            min: 0,
        },
        image: {
            type: String,
            default: 'restaurant', // Default icon
        },
        tags: {
            type: [String],
            default: [],
        },
    },
    {
        timestamps: true,
    }
);

const Recipe = model<IRecipe>('Recipe', RecipeSchema);
export default Recipe;
