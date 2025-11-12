// src/models/FamilyMember.ts
import { Schema, model, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { BCRYPT_SALT_ROUNDS } from '../config/constants';

// Interface for the document, per Governance v3 (Sec 2.C)
// This stores the user's global identity and auth.
export interface IFamilyMember extends Document {
  firstName: string;
  lastName: string; // ADDED per v3 spec
  email: string;
  
  // Authentication fields
  password: string; // Stored hash
  passwordChangedAt?: Date;

  // Custom method signature for checking password
  comparePassword(candidatePassword: string): Promise<boolean>;
}

// Schema definition
const FamilyMemberSchema = new Schema<IFamilyMember>(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
    },
    lastName: { // ADDED per v3 spec
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      // Simple email validation
      match: [/.+@.+\..+/, 'Please enter a valid email address'],
    },
    // The Hashed Password
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false, // Ensures hash is not retrieved by default queries
      minlength: 8,
    },
    passwordChangedAt: Date, // Tracks last password update
    
    // REMOVED 'role' and 'householdRefs' as they are no longer global.
    // Role and points are now managed *inside* the Household model.
  },
  {
    timestamps: true,
    collection: 'familymembers', // Governance: lowercase_plural
  },
);

// Pre-save hook to hash the password before saving
FamilyMemberSchema.pre('save', async function(next) {
    // Only run this function if password was actually modified
    if (!this.isModified('password')) return next();
    
    // Hash the password with cost factor
    this.password = await bcrypt.hash(this.password, BCRYPT_SALT_ROUNDS);
    
    // Update the password change timestamp (used for invalidating old JWTs)
    // Set it 1 second in the past to ensure JWT is created *after* this timestamp
    this.passwordChangedAt = new Date(Date.now() - 1000); 
    
    next();
});

// Instance method to compare candidate password with the stored hash
FamilyMemberSchema.methods.comparePassword = async function(
  candidatePassword: string
): Promise<boolean> {
  // 'this.password' is not available here if 'select: false' is active
  // But since we are calling this method on a user doc where we *expect*
  // to check the password, we assume the query explicitly selected it.
  
  // Handle case where password might not be selected (though it should be)
  if (!this.password) {
    // To be safe, re-fetch the document with the password
    const user = await model('FamilyMember').findById(this._id).select('+password');
    if (!user || !user.password) return false;
    return bcrypt.compare(candidatePassword, user.password);
  }

  return bcrypt.compare(candidatePassword, this.password);
};


// Mandatory PascalCase Model name
const FamilyMember = model<IFamilyMember>('FamilyMember', FamilyMemberSchema);

export default FamilyMember;