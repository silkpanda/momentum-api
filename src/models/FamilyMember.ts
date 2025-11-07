// silkpanda/momentum-api/momentum-api-556c5b7b5d534751fdc505eedf6113f20a02cc98/src/models/FamilyMember.ts
import { Schema, model, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs'; // Import bcryptjs for pre-save hook
import { BCRYPT_SALT_ROUNDS } from '../config/constants'; // <-- NEW IMPORT

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

// NEW: Pre-save hook to hash the password before saving
FamilyMemberSchema.pre('save', async function(next) {
    // Only run this function if password was actually modified AND it exists (i.e., it's a Parent)
    if (!this.isModified('password') || !this.password) return next();
    
    // Hash the password with cost factor defined in constants
    this.password = await bcrypt.hash(this.password, BCRYPT_SALT_ROUNDS);
    
    // Update the password change timestamp (used for invalidating old JWTs)
    this.passwordChangedAt = new Date(Date.now() - 1000); // 1 second ago to ensure it's before the JWT creation timestamp
    
    next();
});


// ADDED: Instance method to compare candidate password with the stored hash
FamilyMemberSchema.methods.comparePassword = async function(
  candidatePassword: string
): Promise<boolean> {
  // If the password field was not selected, return false immediately
  if (!this.password) return false;
  
  // Use bcrypt to compare the plain text password with the hashed password
  return bcrypt.compare(candidatePassword, this.password);
};


// Mandatory PascalCase Model name
const FamilyMember = model<IFamilyMember>('FamilyMember', FamilyMemberSchema); 

export default FamilyMember;