import mongoose, { Schema, Document } from 'mongoose';

export interface IRoutineStep {
    title: string;
    description?: string;
    durationSeconds?: number;
    icon?: string;
}

export interface IRoutine extends Document {
    householdId: mongoose.Types.ObjectId;
    assignedTo: string; // Member ID

    title: string;
    description?: string;
    icon: string;
    color: string;

    steps: IRoutineStep[];

    schedule: {
        days: string[]; // ['Mon', 'Tue', etc.]
        startTime?: string; // "07:00"
    };

    pointsReward: number;
    isActive: boolean;

    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const RoutineStepSchema = new Schema<IRoutineStep>({
    title: { type: String, required: true },
    description: { type: String },
    durationSeconds: { type: Number },
    icon: { type: String, default: 'checkbox' }
});

const RoutineSchema = new Schema<IRoutine>({
    householdId: {
        type: Schema.Types.ObjectId,
        ref: 'Household',
        required: true
    },
    assignedTo: {
        type: String,
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: { type: String },
    icon: { type: String, default: 'list' },
    color: { type: String, default: '#4F46E5' },

    steps: [RoutineStepSchema],

    schedule: {
        days: [{ type: String }],
        startTime: { type: String }
    },

    pointsReward: { type: Number, default: 10 },
    isActive: { type: Boolean, default: true },

    createdBy: {
        type: Schema.Types.ObjectId,
        required: true
    }
}, {
    timestamps: true
});

// Indexes
RoutineSchema.index({ householdId: 1, assignedTo: 1 });

export default mongoose.model<IRoutine>('Routine', RoutineSchema);
