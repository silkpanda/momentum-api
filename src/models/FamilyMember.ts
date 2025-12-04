// src/models/FamilyMember.ts
import { Schema, model, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { BCRYPT_SALT_ROUNDS } from '../config/constants';

// Interface for household-specific data (when data is NOT shared)
export interface IHouseholdSpecificData {
  points: number;
  xp: number;
  currentStreak: number;
  streakLastUpdated: Date;
}

// Interface for linked household info
export interface ILinkedHousehold {
  householdId: Types.ObjectId;
  linkCode: string;
  linkedAt: Date;
  linkedBy: Types.ObjectId;
  householdSpecificData: IHouseholdSpecificData;
}

// Interface for shared data (only populated when households agree to share)
export interface ISharedData {
  points?: number;
  xp?: number;
  currentStreak?: number;
  streakLastUpdated?: Date;
}

// Interface for the document, per Governance v3 (Sec 2.C)
export interface IFamilyMember extends Document {
  firstName: string;
  lastName: string; // ADDED per v3 spec
  email: string;

  // Authentication fields
  password?: string; // Stored hash (optional for Google OAuth users)
  passwordChangedAt?: Date;

  // Google OAuth
  googleId?: string; // Google account ID for OAuth users
  onboardingCompleted?: boolean; // Track if user has completed onboarding

  // PIN Authentication (4-digit, hashed)
  pin?: string; // Stored hash (bcrypt)
  pinSetupCompleted?: boolean; // Flag to track if user has set up PIN
  lastPinVerification?: Date; // Timestamp of last successful PIN verification

  // Multi-household support (for children in separated parent households)
  linkedHouseholds?: ILinkedHousehold[];
  sharedData?: ISharedData;

  // Google Calendar Integration
  googleCalendar?: {
    accessToken: string;
    refreshToken: string;
    expiryDate: number;
    selectedCalendarId?: string; // ID of the calendar to sync with Momentum
  };

  // Push Notifications
  pushTokens?: string[];

  // Custom method signatures
  comparePassword(candidatePassword: string): Promise<boolean>;
  comparePin(candidatePin: string): Promise<boolean>;
}

// Sub-schemas
const HouseholdSpecificDataSchema = new Schema<IHouseholdSpecificData>(
  {
    points: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 },
    streakLastUpdated: { type: Date, default: Date.now },
  },
  { _id: false }
);

const LinkedHouseholdSchema = new Schema<ILinkedHousehold>(
  {
    householdId: { type: Schema.Types.ObjectId, ref: 'Household', required: true },
    linkCode: { type: String, required: true },
    linkedAt: { type: Date, default: Date.now },
    linkedBy: { type: Schema.Types.ObjectId, ref: 'FamilyMember', required: true },
    householdSpecificData: { type: HouseholdSpecificDataSchema, default: () => ({}) },
  },
  { _id: false }
);

const SharedDataSchema = new Schema<ISharedData>(
  {
    points: Number,
    xp: Number,
    currentStreak: Number,
    streakLastUpdated: Date,
  },
  { _id: false }
);

// Main schema definition
const FamilyMemberSchema = new Schema<IFamilyMember>(
  {
    firstName: { type: String, required: [true, 'First name is required'], trim: true },
    lastName: { type: String, required: [true, 'Last name is required'], trim: true },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/.+@.+\\..+/, 'Please enter a valid email address'],
    },
    // Optional password for non‑Google accounts
    password: { type: String, required: false, select: false, minlength: 8 },
    passwordChangedAt: Date,
    // Google OAuth fields
    googleId: { type: String, sparse: true, unique: true },
    onboardingCompleted: { type: Boolean, default: false },
    // PIN fields
    pin: { type: String, select: false },
    pinSetupCompleted: { type: Boolean, default: false },
    lastPinVerification: Date,
    // Multi‑household support
    linkedHouseholds: [LinkedHouseholdSchema],
    sharedData: SharedDataSchema,
    // Calendar integration
    googleCalendar: {
      accessToken: String,
      refreshToken: String,
      expiryDate: Number,
      selectedCalendarId: String,
    },
    // Push tokens
    pushTokens: [{ type: String }],
  },
  { timestamps: true, collection: 'familymembers' }
);

// Pre‑save hook to hash password and PIN when they change
FamilyMemberSchema.pre('save', async function (next) {
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, BCRYPT_SALT_ROUNDS);
    this.passwordChangedAt = new Date(Date.now() - 1000);
  }
  if (this.isModified('pin') && this.pin) {
    this.pin = await bcrypt.hash(this.pin, BCRYPT_SALT_ROUNDS);
  }
  next();
});

// Compare password method
FamilyMemberSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  if (!this.password) {
    const user = await model('FamilyMember').findById(this._id).select('+password');
    if (!user || !user.password) return false;
    return bcrypt.compare(candidatePassword, user.password);
  }
  return bcrypt.compare(candidatePassword, this.password);
};

// Compare PIN method with detailed logging
FamilyMemberSchema.methods.comparePin = async function (
  candidatePin: string
): Promise<boolean> {
  console.log('[comparePin] Candidate PIN length:', candidatePin.length);
  console.log('[comparePin] Stored PIN hash length:', this.pin?.length);
  if (!this.pin) {
    const user = await model('FamilyMember').findById(this._id).select('+pin');
    if (!user || !user.pin) {
      console.log('[comparePin] No PIN found on re‑fetch');
      return false;
    }
    const result = await bcrypt.compare(candidatePin, user.pin);
    console.log('[comparePin] Result after re‑fetch:', result);
    return result;
  }
  const result = await bcrypt.compare(candidatePin, this.pin);
  console.log('[comparePin] Result:', result);
  return result;
};

const FamilyMember = model<IFamilyMember>('FamilyMember', FamilyMemberSchema);
export default FamilyMember;