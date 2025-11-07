import { Schema, model, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs'; // Import bcryptjs for pre-save hook

// Interface for the document, using PascalCase for the interface name
export interface IFamilyMember extends Document {
  firstName: string; 
  email: string;
  role: 'Parent' | 'Child';
  householdRefs: Types.ObjectId[]; 
  // CRITICAL ADDITIONS for Authentication:
  password?: string; // Stored hash (optional for children)
  passwordChangedAt?: Date;
  // Custom method signature for checking password
  comparePassword(candidatePassword: string): Promise<boolean>; // ADDED
}

// Schema definition
const FamilyMemberSchema = new Schema<IFamilyMember>(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true, 
      trim: true,
      lowercase: true,
    },
    role: {
      type: String,
      enum: ['Parent', 'Child'], 
      required: true,
    },
    // CRITICAL ADDITION: The Hashed Password
    password: {
      type: String,
      required: function (this: IFamilyMember) {
        // Only Parents must have a password hash
        return this.role === 'Parent'; 
      },
      select: false, // Ensures hash is not retrieved by default queries
    },
    passwordChangedAt: Date, // Tracks last password update
    householdRefs: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: 'Household',
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'familymembers', 
  },
);

// ADDED: Instance method to compare candidate password with the stored hash
FamilyMemberSchema.methods.comparePassword = async function(
  candidatePassword: string
): Promise<boolean> {
  // If the password field was not selected, return false immediately
  if (!this.password) return false;
  
  // Use bcrypt to compare the plain text password with the hashed password
  return bcrypt.compare(candidatePassword, this.password);
};


// We should also add a pre-save hook to hash the password here, 
// ensuring consistency, but for now, we rely on the controller logic.

// Mandatory PascalCase Model name
const FamilyMember = model<IFamilyMember>('FamilyMember', FamilyMemberSchema); 

export default FamilyMember;