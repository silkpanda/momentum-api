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
}

// Interface for the main Household document
export interface IHousehold extends Document {
  householdName: string; // e.g., "Smith-Jones Family"

  // The new mandatory, unified array (replaces parentRefs and childProfiles)
  memberProfiles: IHouseholdMemberProfile[];

  inviteCode?: string; // Unique code for joining
}

// Sub-schema for the embedded member profile data (camelCase, mandatory fields)
const HouseholdMemberProfileSchema = new Schema<IHouseholdMemberProfile>({
  familyMemberId: {
    type: Schema.Types.ObjectId,
    ref: 'FamilyMember', // Reference to the global user
    required: true,
  },
  displayName: {
    type: String,
    required: [true, 'Display name is required'],
    trim: true,
  },
  profileColor: {
    type: String,
    required: [true, 'Profile color is required'],
  },
  role: {
    type: String,
    enum: ['Parent', 'Child'],
    required: [true, 'Member role is required'],
  },
  pointsTotal: {
    type: Number,
    default: 0,
    min: 0,
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
  },
  {
    timestamps: true,
    collection: 'households', // Mandatory lowercase_plural collection name
  },
);

// Mandatory PascalCase Model name
const Household = model<IHousehold>('Household', HouseholdSchema);

export default Household;