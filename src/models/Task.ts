import { Schema, model, Document, Types } from 'mongoose';

// Define the simple recurrence options for the MVP
type RecurrenceType = 'None' | 'Daily' | 'Weekly';

// Interface for the Task document
export interface ITask extends Document {
  taskName: string; 
  description: string;
  pointsValue: number;
  recurrence: RecurrenceType;
  // This array links to the FamilyMember documents who are assigned this task
  assignedToRefs: Types.ObjectId[]; 
  // CRITICAL: Links the task to the Household context
  householdRefId: Types.ObjectId; 
  // For tasks that are manually checked off (not recurring resets)
  isCompleted: boolean;
}

// Schema definition
const TaskSchema = new Schema<ITask>(
  {
    taskName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    pointsValue: {
      type: Number,
      required: true,
      min: 1, // Tasks must give at least 1 point
    },
    recurrence: {
      type: String,
      enum: ['None', 'Daily', 'Weekly'],
      default: 'None',
    },
    assignedToRefs: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: 'FamilyMember',
        },
      ],
      default: [],
      // Using 'assignedToRefs' adheres to the 'camelCase + Ref/Id' naming for array references
    },
    householdRefId: {
      type: Schema.Types.ObjectId,
      ref: 'Household',
      required: true,
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: 'tasks', // Mandatory lowercase_plural collection name
  },
);

// Mandatory PascalCase Model name
const Task = model<ITask>('Task', TaskSchema);

export default Task;