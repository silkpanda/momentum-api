// src/models/ChildLinkCode.ts
import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IChildLinkCode extends Document {
    childId: Types.ObjectId;
    code: string;
    createdBy: Types.ObjectId;
    householdId: Types.ObjectId;
    expiresAt: Date;
    usedBy?: Types.ObjectId;
    usedAt?: Date;
    status: 'active' | 'used' | 'expired';
    isValid(): boolean;
    markAsUsed(usedByHouseholdId: Types.ObjectId): Promise<void>;
}

export interface IChildLinkCodeModel extends mongoose.Model<IChildLinkCode> {
    generateCode(childFirstName: string): Promise<string>;
}

const ChildLinkCodeSchema = new Schema<IChildLinkCode>(
    {
        childId: {
            type: Schema.Types.ObjectId,
            ref: 'FamilyMember',
            required: true,
            index: true,
        },
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            index: true,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'FamilyMember',
            required: true,
        },
        householdId: {
            type: Schema.Types.ObjectId,
            ref: 'Household',
            required: true,
        },
        expiresAt: {
            type: Date,
            required: true,
            index: true,
        },
        usedBy: {
            type: Schema.Types.ObjectId,
            ref: 'Household',
        },
        usedAt: {
            type: Date,
        },
        status: {
            type: String,
            enum: ['active', 'used', 'expired'],
            default: 'active',
            index: true,
        },
    },
    {
        timestamps: true,
    }
);

// Index for cleanup of expired codes
ChildLinkCodeSchema.index({ expiresAt: 1, status: 1 });

// Method to check if code is valid
ChildLinkCodeSchema.methods.isValid = function (): boolean {
    if (this.status !== 'active') return false;
    if (this.expiresAt < new Date()) {
        this.status = 'expired';
        this.save();
        return false;
    }
    return true;
};

// Method to mark code as used (expires immediately for security)
ChildLinkCodeSchema.methods.markAsUsed = async function (usedByHouseholdId: Types.ObjectId): Promise<void> {
    this.status = 'used';
    this.usedBy = usedByHouseholdId;
    this.usedAt = new Date();
    await this.save();
};

// Static method to generate unique 6-character code
ChildLinkCodeSchema.statics.generateCode = async function (childFirstName: string): Promise<string> {
    let code: string;
    let exists = true;
    let attempts = 0;

    while (exists && attempts < 20) {
        // Generate a random 6-character alphanumeric code
        code = Math.random().toString(36).substring(2, 8).toUpperCase();

        // Ensure it's exactly 6 characters (pad if needed)
        code = code.padEnd(6, '0').substring(0, 6);

        const existing = await this.findOne({ code });
        exists = !!existing;
        attempts++;
    }

    if (exists) {
        throw new Error('Failed to generate unique code');
    }

    return code!;
};

const ChildLinkCode = mongoose.model<IChildLinkCode, IChildLinkCodeModel>('ChildLinkCode', ChildLinkCodeSchema);

export default ChildLinkCode;
