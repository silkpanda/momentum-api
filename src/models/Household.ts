import { Schema, model, Document, Types } from 'mongoose';

// Interface for embedded point/profile data specific to a Household
export interface IHouseholdMemberProfile {
  memberRefId: Types.ObjectId; // Reference to the FamilyMember (User) document
  profileColor: string; // The member's designated color *in this household*
  pointsTotal: number; // The member's points *in this household*
}

// Interface for the Household document
export interface IHousehold extends Document {
  householdName: string; // e.g., "Smith-Jones Family"
  parentRefs: Types.ObjectId[]; // Array of references to FamilyMember documents (Parents)
  childProfiles: IHouseholdMemberProfile[]; // Embedded array of child-specific data
}

// Sub-schema for the embedded member profile data (camelCase, mandatory fields)
const HouseholdMemberProfileSchema = new Schema<IHouseholdMemberProfile>({
  memberRefId: { 
    type: Schema.Types.ObjectId,
    ref: 'FamilyMember', // Reference to the actual user profile
    required: true,
    // Object References must use camelCase + Id suffix (e.g., memberRefId)
  },
  profileColor: {
    type: String,
    required: true,
  },
  pointsTotal: {
    type: Number,
    default: 0,
    min: 0,
  },
}, { _id: false }); // No separate _id needed for embedded sub-documents

// Household Schema definition
const HouseholdSchema = new Schema<IHousehold>(
  {
    householdName: {
      type: String,
      required: true,
      trim: true,
    },
    parentRefs: {
      // Parents have a simple 1:N reference array.
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: 'FamilyMember',
        },
      ],
      required: true, // Must have at least one parent
    },
    // The core list of children with their Household-specific data
    childProfiles: { 
      type: [HouseholdMemberProfileSchema],
      default: [],
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