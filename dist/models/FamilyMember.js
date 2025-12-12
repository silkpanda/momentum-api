"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/models/FamilyMember.ts
const mongoose_1 = require("mongoose");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const constants_1 = require("../config/constants");
// Sub-schemas
const HouseholdSpecificDataSchema = new mongoose_1.Schema({
    points: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 },
    streakLastUpdated: { type: Date, default: Date.now },
}, { _id: false });
const LinkedHouseholdSchema = new mongoose_1.Schema({
    householdId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Household', required: true },
    linkCode: { type: String, required: true },
    linkedAt: { type: Date, default: Date.now },
    linkedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'FamilyMember', required: true },
    householdSpecificData: { type: HouseholdSpecificDataSchema, default: () => ({}) },
}, { _id: false });
const SharedDataSchema = new mongoose_1.Schema({
    points: Number,
    xp: Number,
    currentStreak: Number,
    streakLastUpdated: Date,
}, { _id: false });
// Main schema definition
const FamilyMemberSchema = new mongoose_1.Schema({
    firstName: { type: String, required: [true, 'First name is required'], trim: true },
    lastName: { type: String, required: [true, 'Last name is required'], trim: true },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/.+@.+\..+/, 'Please enter a valid email address'],
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
}, { timestamps: true, collection: 'familymembers' });
// Pre‑save hook to hash password and PIN when they change
FamilyMemberSchema.pre('save', async function (next) {
    if (this.isModified('password') && this.password) {
        this.password = await bcryptjs_1.default.hash(this.password, constants_1.BCRYPT_SALT_ROUNDS);
        this.passwordChangedAt = new Date(Date.now() - 1000);
    }
    if (this.isModified('pin') && this.pin) {
        this.pin = await bcryptjs_1.default.hash(this.pin, constants_1.BCRYPT_SALT_ROUNDS);
    }
    next();
});
// Compare password method
FamilyMemberSchema.methods.comparePassword = async function (candidatePassword) {
    if (!this.password) {
        const user = await (0, mongoose_1.model)('FamilyMember').findById(this._id).select('+password');
        if (!user || !user.password)
            return false;
        return bcryptjs_1.default.compare(candidatePassword, user.password);
    }
    return bcryptjs_1.default.compare(candidatePassword, this.password);
};
// Compare PIN method with detailed logging
FamilyMemberSchema.methods.comparePin = async function (candidatePin) {
    // Ensure the candidate PIN is a string (in case a number is sent)
    const pinStr = `${candidatePin}`;
    console.log('[comparePin] Candidate PIN (as string):', pinStr);
    console.log('[comparePin] Candidate PIN length:', pinStr.length);
    console.log('[comparePin] Stored PIN hash length:', this.pin?.length);
    console.log('[comparePin] Stored PIN hash (masked):', this.pin ? `${this.pin.slice(0, 10)}...` : 'none');
    if (!this.pin) {
        const user = await (0, mongoose_1.model)('FamilyMember').findById(this._id).select('+pin');
        if (!user || !user.pin) {
            console.log('[comparePin] No PIN found on re-fetch');
            return false;
        }
        const result = await bcryptjs_1.default.compare(pinStr, user.pin);
        console.log('[comparePin] Result after re-fetch:', result);
        return result;
    }
    const result = await bcryptjs_1.default.compare(pinStr, this.pin);
    console.log('[comparePin] Result:', result);
    return result;
};
const FamilyMember = (0, mongoose_1.model)('FamilyMember', FamilyMemberSchema);
exports.default = FamilyMember;
//# sourceMappingURL=FamilyMember.js.map