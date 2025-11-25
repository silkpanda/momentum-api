// src/models/Routine.ts
import mongoose, { Schema, Document, Types } from 'mongoose';

// Individual routine item (e.g., "Brush teeth", "Pack backpack")
export interface IRoutineItem {
    _id?: Types.ObjectId;
    title: string;
    order: number; // Display order in the list
    isCompleted: boolean;
    completedAt?: Date;
}

// Main Routine document
export interface IRoutine extends Document {
    householdId: Types.ObjectId;
    memberId: Types.ObjectId; // Which member this routine belongs to
    timeOfDay: 'morning' | 'noon' | 'night';
    title: string; // e.g., "Morning Routine", "After School Routine"
    items: IRoutineItem[];
    isActive: boolean;
    lastResetDate?: string; // ISO date string (YYYY-MM-DD) for tracking daily resets
    createdBy: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

// Sub-schema for routine items
const RoutineItemSchema = new Schema<IRoutineItem>({
    title: {
        type: String,
        required: [true, 'Routine item title is required'],
        trim: true,
    },
    order: {
        type: Number,
        required: true,
        default: 0,
    },
    isCompleted: {
        type: Boolean,
        default: false,
    },
    completedAt: {
        type: Date,
        default: null,
    },
}, {
    _id: true, // Auto-generate _id for each item
});

// Main Routine Schema
const RoutineSchema = new Schema<IRoutine>(
    {
        householdId: {
            type: Schema.Types.ObjectId,
            ref: 'Household',
            required: [true, 'Household ID is required'],
            index: true,
        },
        memberId: {
            type: Schema.Types.ObjectId,
            required: [true, 'Member ID is required'],
            index: true,
        },
        timeOfDay: {
            type: String,
            enum: ['morning', 'noon', 'night'],
            required: [true, 'Time of day is required'],
            default: 'morning',
        },
        title: {
            type: String,
            required: [true, 'Routine title is required'],
            trim: true,
        },
        items: {
            type: [RoutineItemSchema],
            default: [],
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        lastResetDate: {
            type: String,
            default: null,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            required: true,
        },
    },
    {
        timestamps: true,
        collection: 'routines',
    },
);

// Compound index for efficient queries
RoutineSchema.index({ householdId: 1, memberId: 1, timeOfDay: 1 });

const Routine = mongoose.model<IRoutine>('Routine', RoutineSchema);

export default Routine;
