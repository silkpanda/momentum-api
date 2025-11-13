// silkpanda/momentum-api/momentum-api-234e21f44dd55f086a321bc9901934f98b747c7a/src/models/Task.ts
import { Schema, model, Document, Types } from 'mongoose';
import { IHouseholdMemberProfile } from './Household'; // This is needed

/**
 * Interface definition for a Task.
 *
 * --- THIS IS THE FIX ---
 * We remove `extends Document`. Mongoose will add the Document properties
 * automatically at compile time via the `model<ITask>` call.
 * This resolves the conflict that causes the 'status' property error.
 */
export interface ITask {
  householdId: Types.ObjectId;
  title: string;
  description?: string;
  assignedTo: IHouseholdMemberProfile['_id']; // Ref to sub-doc ID
  points: number;
  status: 'Pending' | 'Completed' | 'Approved';
  schedule?: {
    type: 'Daily' | 'Weekly' | 'Once';
    // Additional fields as needed, e.g., dayOfWeek for Weekly
  };
  createdBy: Types.ObjectId; // Ref to FamilyMember
  completedBy?: Types.ObjectId; // Ref to FamilyMember
  completedAt?: Date;
  approvedBy?: Types.ObjectId; // Ref to FamilyMember
  approvedAt?: Date;
}

// Schema definition
const taskSchema = new Schema<ITask>(
  {
    householdId: {
      type: Schema.Types.ObjectId,
      ref: 'Household',
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String },
    assignedTo: {
      type: Schema.Types.ObjectId, // This is IHouseholdMemberProfile['_id']
      required: true,
    },
    points: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Approved'],
      default: 'Pending',
      required: true,
    },
    schedule: {
      type: { type: String, enum: ['Daily', 'Weekly', 'Once'] },
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'FamilyMember',
      required: true,
    },
    completedBy: {
      type: Schema.Types.ObjectId,
      ref: 'FamilyMember',
    },
    completedAt: { type: Date },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'FamilyMember',
    },
    approvedAt: { type: Date },
  },
  { timestamps: true }, // Adds createdAt and updatedAt
);

export default model<ITask>('Task', taskSchema);