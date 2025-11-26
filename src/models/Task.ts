// src/models/Task.ts
import { Schema, model, Document, Types } from 'mongoose';

// --- THIS IS THE V4 REVISION (STEP 3.3) ---
// The status enum is updated to support the new approval flow.
// 'Pending' = To-do
// 'PendingApproval' = Child has marked it done
// 'Approved' = Parent has approved it and points are awarded
// 'Rejected' = (Optional future state) Parent denies completion
export type TaskStatus = 'Pending' | 'PendingApproval' | 'Approved';

export interface ITask extends Document {
  householdId: Types.ObjectId; // Link to the household context
  visibleToHouseholds?: Types.ObjectId[]; // Array of other households that can see this task
  title: string;
  description?: string;
  pointsValue: number;

  // --- UPDATED ---
  status: TaskStatus;

  // Array of member profile sub-document IDs
  // This is who the task is ASSIGNED to
  assignedTo: Types.ObjectId[];

  // The specific member profile ID who completed the task
  completedBy?: Types.ObjectId;

  dueDate?: Date;
  isRecurring: boolean;
  recurrenceInterval?: 'daily' | 'weekly' | 'monthly';

  // Governance: Must be camelCase
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<ITask>(
  {
    householdId: {
      type: Schema.Types.ObjectId,
      ref: 'Household',
      required: true,
      index: true, // Good for performance
    },
    visibleToHouseholds: [{
      type: Schema.Types.ObjectId,
      ref: 'Household',
    }],
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    pointsValue: {
      type: Number,
      required: [true, 'Points value is required'],
      min: 0,
    },

    // --- THIS IS THE UPDATED FIELD ---
    status: {
      type: String,
      enum: ['Pending', 'PendingApproval', 'Approved'], // v4 Status Flow
      default: 'Pending',
      required: true,
    },
    // --- END OF UPDATE ---

    assignedTo: [
      {
        type: Schema.Types.ObjectId, // Refers to the Household.memberProfiles._id
        required: true,
      },
    ],
    completedBy: {
      type: Schema.Types.ObjectId, // Refers to the Household.memberProfiles._id
    },
    dueDate: {
      type: Date,
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurrenceInterval: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
    },
  },
  {
    timestamps: true, // Manages createdAt and updatedAt
    collection: 'tasks', // Governance: lowercase_plural
  },
);

// Mandatory PascalCase Model name
const Task = model<ITask>('Task', TaskSchema);

export default Task;