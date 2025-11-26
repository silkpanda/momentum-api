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

  // PIN Authentication (4-digit, hashed)
  pin?: string; // Stored hash (bcrypt)
  pinSetupCompleted?: boolean; // Flag to track if user has set up PIN
  lastPinVerification?: Date; // Timestamp of last successful PIN verification

  // Custom method signature for checking password
  comparePassword(candidatePassword: string): Promise<boolean>;
  // Custom method signature for checking PIN
  comparePin(candidatePin: string): Promise<boolean>;
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

    // PIN Authentication fields
    pin: {
      type: String,
      select: false, // Ensures hash is not retrieved by default queries
    },
    pinSetupCompleted: {
      type: Boolean,
      default: false,
    },
    lastPinVerification: Date,

    // REMOVED 'role' and 'householdRefs' as they are no longer global.
    // Role and points are now managed *inside* the Household model.
  },
  {
    timestamps: true,
    collection: 'familymembers', // Governance: lowercase_plural
  },
);

// Pre-save hook to hash the password and PIN before saving
FamilyMemberSchema.pre('save', async function (next) {
  // Hash password if modified
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, BCRYPT_SALT_ROUNDS);
    // Update the password change timestamp (used for invalidating old JWTs)
    // Set it 1 second in the past to ensure JWT is created *after* this timestamp
    this.passwordChangedAt = new Date(Date.now() - 1000);
  }

  // Hash PIN if modified
  if (this.isModified('pin') && this.pin) {
    this.pin = await bcrypt.hash(this.pin, BCRYPT_SALT_ROUNDS);
  }

  next();
});

// Instance method to compare candidate password with the stored hash
FamilyMemberSchema.methods.comparePassword = async function (
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

// Instance method to compare candidate PIN with the stored hash
FamilyMemberSchema.methods.comparePin = async function (
  candidatePin: string
): Promise<boolean> {
  // Handle case where PIN might not be selected
  if (!this.pin) {
    // Re-fetch the document with the PIN
    const user = await model('FamilyMember').findById(this._id).select('+pin');
    if (!user || !user.pin) return false;
    return bcrypt.compare(candidatePin, user.pin);
  }

  return bcrypt.compare(candidatePin, this.pin);
};


// Mandatory PascalCase Model name
const FamilyMember = model<IFamilyMember>('FamilyMember', FamilyMemberSchema);

export default FamilyMember;