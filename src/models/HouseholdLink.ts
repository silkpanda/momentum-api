// src/models/HouseholdLink.ts
import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPendingChange {
    _id?: Types.ObjectId;
    proposedBy: Types.ObjectId;
    proposedByHousehold: Types.ObjectId;
    proposedAt: Date;
    setting: 'points' | 'xp' | 'streaks' | 'tasks' | 'quests' | 'routines' | 'store' | 'wishlist' | 'calendar';
    currentValue: 'shared' | 'separate';
    proposedValue: 'shared' | 'separate';
    status: 'pending' | 'approved' | 'rejected' | 'expired';
    expiresAt: Date;
    previousRejections: number;
    lastRejectedAt?: Date;
    canRepropose: boolean;
}

export interface IProposalHistoryEntry {
    setting: string;
    proposedAt: Date;
    proposedBy: Types.ObjectId;
}

export interface ISharingSettings {
    points: 'shared' | 'separate';
    xp: 'shared' | 'separate';
    streaks: 'shared' | 'separate';
    tasks: 'shared' | 'separate';
    quests: 'shared' | 'separate';
    routines: 'shared' | 'separate';
    store: 'shared' | 'separate';
    wishlist: 'shared' | 'separate';
    calendar: 'shared' | 'separate';
}

export interface IHouseholdLink extends Document {
    childId: Types.ObjectId;
    household1: Types.ObjectId;
    household2: Types.ObjectId;
    linkCode: string;
    createdBy: Types.ObjectId;
    createdAt: Date;
    acceptedBy: Types.ObjectId;
    acceptedAt: Date;
    sharingSettings: ISharingSettings;
    pendingChanges: IPendingChange[];
    proposalHistory: IProposalHistoryEntry[];
    status: 'active' | 'unlinked';
}

const PendingChangeSchema = new Schema<IPendingChange>({
    proposedBy: {
        type: Schema.Types.ObjectId,
        ref: 'FamilyMember',
        required: true,
    },
    proposedByHousehold: {
        type: Schema.Types.ObjectId,
        ref: 'Household',
        required: true,
    },
    proposedAt: {
        type: Date,
        default: Date.now,
    },
    setting: {
        type: String,
        enum: ['points', 'xp', 'streaks', 'tasks', 'quests', 'routines', 'store', 'wishlist', 'calendar'],
        required: true,
    },
    currentValue: {
        type: String,
        enum: ['shared', 'separate'],
        required: true,
    },
    proposedValue: {
        type: String,
        enum: ['shared', 'separate'],
        required: true,
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'expired'],
        default: 'pending',
    },
    expiresAt: {
        type: Date,
        required: true,
    },
    previousRejections: {
        type: Number,
        default: 0,
    },
    lastRejectedAt: {
        type: Date,
    },
    canRepropose: {
        type: Boolean,
        default: true,
    },
});

const ProposalHistoryEntrySchema = new Schema<IProposalHistoryEntry>({
    setting: {
        type: String,
        required: true,
    },
    proposedAt: {
        type: Date,
        default: Date.now,
    },
    proposedBy: {
        type: Schema.Types.ObjectId,
        ref: 'FamilyMember',
        required: true,
    },
});

const SharingSettingsSchema = new Schema<ISharingSettings>({
    points: {
        type: String,
        enum: ['shared', 'separate'],
        default: 'separate',
    },
    xp: {
        type: String,
        enum: ['shared', 'separate'],
        default: 'separate',
    },
    streaks: {
        type: String,
        enum: ['shared', 'separate'],
        default: 'separate',
    },
    tasks: {
        type: String,
        enum: ['shared', 'separate'],
        default: 'separate',
    },
    quests: {
        type: String,
        enum: ['shared', 'separate'],
        default: 'separate',
    },
    routines: {
        type: String,
        enum: ['shared', 'separate'],
        default: 'separate',
    },
    store: {
        type: String,
        enum: ['shared', 'separate'],
        default: 'separate',
    },
    wishlist: {
        type: String,
        enum: ['shared', 'separate'],
        default: 'separate',
    },
    calendar: {
        type: String,
        enum: ['shared', 'separate'],
        default: 'separate',
    },
}, { _id: false });

const HouseholdLinkSchema = new Schema<IHouseholdLink>(
    {
        childId: {
            type: Schema.Types.ObjectId,
            ref: 'FamilyMember',
            required: true,
            index: true,
        },
        household1: {
            type: Schema.Types.ObjectId,
            ref: 'Household',
            required: true,
            index: true,
        },
        household2: {
            type: Schema.Types.ObjectId,
            ref: 'Household',
            required: true,
            index: true,
        },
        linkCode: {
            type: String,
            required: true,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'FamilyMember',
            required: true,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
        acceptedBy: {
            type: Schema.Types.ObjectId,
            ref: 'FamilyMember',
            required: true,
        },
        acceptedAt: {
            type: Date,
            default: Date.now,
        },
        sharingSettings: {
            type: SharingSettingsSchema,
            default: () => ({}),
        },
        pendingChanges: [PendingChangeSchema],
        proposalHistory: [ProposalHistoryEntrySchema],
        status: {
            type: String,
            enum: ['active', 'unlinked'],
            default: 'active',
        },
    },
    {
        timestamps: true,
    }
);

// Compound index to ensure unique links between households for a child
HouseholdLinkSchema.index({ childId: 1, household1: 1, household2: 1 }, { unique: true });

// Index for finding all links for a household
HouseholdLinkSchema.index({ household1: 1, status: 1 });
HouseholdLinkSchema.index({ household2: 1, status: 1 });

const HouseholdLink = mongoose.model<IHouseholdLink>('HouseholdLink', HouseholdLinkSchema);

export default HouseholdLink;
