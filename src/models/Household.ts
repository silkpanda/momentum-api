// src/models/Household.ts
import { Schema, model, Document, Types } from 'mongoose';

// Per Governance v3, Sec 2.C
// This sub-document defines a member's role and status *within* this household.
export interface IHouseholdMemberProfile {
  _id?: Types.ObjectId; // <-- FIX: Made _id optional, as Mongoose generates it on creation
  familyMemberId: Types.ObjectId; // Reference to the global IFamilyMember
  displayName: string;          // Household-specific display name (e.g., "Papa Bear")
  profileColor: string;         // Household-specific color from the palette
  role: 'Parent' | 'Child';     // Role *within* this household
  pointsTotal?: number;         // FIX: Made optional, as schema provides a default of 0
  focusedTaskId?: Types.ObjectId; // ADHD Feature: When set, child sees only this task in Focus Mode

  // Streak System (Gamification)
  currentStreak?: number;       // Days of consecutive task completion
  longestStreak?: number;       // Personal best streak
  lastCompletionDate?: string;  // ISO date string for tracking (YYYY-MM-DD)
  streakMultiplier?: number;    // Current point multiplier (1.0, 1.5, 2.0, etc.)

  // Multi-Household Feature
  isLinkedChild?: boolean;      // True if this child is linked to another household
}

// Interface for the main Household document
export interface IHousehold extends Document {
  householdName: string; // e.g., "Smith-Jones Family"

  // The new mandatory, unified array (replaces parentRefs and childProfiles)
  memberProfiles: IHouseholdMemberProfile[];

  inviteCode?: string; // Unique code for joining

  // New Calendar Integration v4
  familyColor?: string; // Shared color for multi-member events
  familyCalendarId?: string; // Google Calendar ID for shared family events
}

// Sub-schema for the embedded member profile data (camelCase, mandatory fields)
const HouseholdMemberProfileSchema = new Schema<IHouseholdMemberProfile>({
  familyMemberId: {
    type: Schema.Types.ObjectId,
    ref: 'FamilyMember',
    required: true,
  },
  displayName: {
    type: String,
    required: true,
  },
  profileColor: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['Parent', 'Child'],
    required: true,
  },
  pointsTotal: {
    type: Number,
    default: 0,
  },
  focusedTaskId: {
    type: Schema.Types.ObjectId,
    ref: 'Task',
  },
  currentStreak: {
    type: Number,
    default: 0,
  },
  longestStreak: {
    type: Number,
    default: 0,
  },
  lastCompletionDate: {
    type: String,
  },
  streakMultiplier: {
    type: Number,
    default: 1.0,
  },
  isLinkedChild: {
    type: Boolean,
    default: false,
  },
}, {
  // This setting ensures Mongoose auto-generates the '_id' for this sub-document
  _id: true
});

// Main Household Schema definition
const HouseholdSchema = new Schema<IHousehold>(
  {
    householdName: {
      type: String,
      required: [true, 'Household name is required'],
      trim: true,
    },
    // The new unified array, replacing the deprecated v2 model
    memberProfiles: {
      type: [HouseholdMemberProfileSchema],
      default: [],
    },
    inviteCode: {
      type: String,
      unique: true,
      sparse: true, // Allows null/undefined to not conflict
    },
    // New Calendar Integration v4
    familyColor: {
      type: String,
      default: '#8B5CF6', // Default to Violet/Purple if not set
    },
    familyCalendarId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'households', // Mandatory lowercase_plural collection name
  },
);

// Mandatory PascalCase Model name
const Household = model<IHousehold>('Household', HouseholdSchema);

export default Household;