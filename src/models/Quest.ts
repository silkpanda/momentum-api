import mongoose, { Schema, Document } from 'mongoose';

export interface IQuestClaim {
    memberId: string;
    claimedAt: Date;
    completedAt?: Date;
    status: 'claimed' | 'completed' | 'approved';
    pointsAwarded?: number;
}

export interface IQuestRecurrence {
    frequency: 'daily' | 'weekly' | 'monthly';
    resetTime?: string;
    lastReset?: Date;
    nextReset?: Date;
}

export interface IQuest extends Document {
    householdId: mongoose.Types.ObjectId;
    title: string;
    description?: string;
    pointsValue: number;

    // Quest-specific
    questType: 'one-time' | 'limited' | 'unlimited' | 'recurring';
    maxClaims?: number;
    currentClaims: number;

    // Claims
    claims: IQuestClaim[];

    // Recurrence
    recurrence?: IQuestRecurrence;

    // Status
    isActive: boolean;
    expiresAt?: Date;

    // Metadata
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const QuestClaimSchema = new Schema<IQuestClaim>({
    memberId: { type: String, required: true },
    claimedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    status: {
        type: String,
        enum: ['claimed', 'completed', 'approved'],
        default: 'claimed'
    },
    pointsAwarded: { type: Number }
});

const QuestRecurrenceSchema = new Schema<IQuestRecurrence>({
    frequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly'],
        required: true
    },
    resetTime: { type: String },
    lastReset: { type: Date },
    nextReset: { type: Date }
});

const QuestSchema = new Schema<IQuest>({
    householdId: {
        type: Schema.Types.ObjectId,
        ref: 'Household',
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    pointsValue: {
        type: Number,
        required: true,
        min: 1
    },
    questType: {
        type: String,
        enum: ['one-time', 'limited', 'unlimited', 'recurring'],
        default: 'one-time'
    },
    maxClaims: {
        type: Number,
        min: 1
    },
    currentClaims: {
        type: Number,
        default: 0
    },
    claims: [QuestClaimSchema],
    recurrence: QuestRecurrenceSchema,
    isActive: {
        type: Boolean,
        default: true
    },
    expiresAt: { type: Date },
    createdBy: {
        type: Schema.Types.ObjectId,
        required: true
    },
}, {
    timestamps: true
});

// Indexes for performance
QuestSchema.index({ householdId: 1, isActive: 1 });
QuestSchema.index({ householdId: 1, questType: 1 });
QuestSchema.index({ expiresAt: 1 });

// Virtual to check if quest is claimable
QuestSchema.virtual('isClaimable').get(function () {
    if (!this.isActive) return false;
    if (this.expiresAt && this.expiresAt < new Date()) return false;

    if (this.questType === 'one-time') {
        return this.currentClaims === 0;
    }

    if (this.questType === 'limited' && this.maxClaims) {
        return this.currentClaims < this.maxClaims;
    }

    return true; // unlimited or recurring
});

// Method to claim quest
QuestSchema.methods.claimQuest = function (memberId: string) {
    // Check if already claimed by this member
    const existingClaim = this.claims.find(
        (c: IQuestClaim) => c.memberId === memberId && c.status !== 'approved'
    );

    if (existingClaim) {
        throw new Error('Quest already claimed by this member');
    }

    // Check if claimable
    if (!this.isClaimable) {
        throw new Error('Quest is not claimable');
    }

    // Add claim
    this.claims.push({
        memberId,
        claimedAt: new Date(),
        status: 'claimed'
    });

    this.currentClaims += 1;

    return this.save();
};

// Method to complete quest
QuestSchema.methods.completeQuest = function (memberId: string) {
    const claim = this.claims.find(
        (c: IQuestClaim) => c.memberId === memberId && c.status === 'claimed'
    );

    if (!claim) {
        throw new Error('No active claim found for this member');
    }

    claim.status = 'completed';
    claim.completedAt = new Date();

    return this.save();
};

// Method to approve quest completion
QuestSchema.methods.approveQuest = function (memberId: string) {
    const claim = this.claims.find(
        (c: IQuestClaim) => c.memberId === memberId && c.status === 'completed'
    );

    if (!claim) {
        throw new Error('No completed claim found for this member');
    }

    claim.status = 'approved';
    claim.pointsAwarded = this.pointsValue;

    return this.save();
};

export default mongoose.model<IQuest>('Quest', QuestSchema);
