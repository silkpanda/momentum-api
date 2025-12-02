import mongoose, { Document, Schema } from 'mongoose';

export enum NotificationType {
    TASK_ASSIGNED = 'TASK_ASSIGNED',
    TASK_COMPLETED = 'TASK_COMPLETED',
    TASK_APPROVED = 'TASK_APPROVED',
    TASK_REJECTED = 'TASK_REJECTED',
    QUEST_AVAILABLE = 'QUEST_AVAILABLE',
    QUEST_COMPLETED = 'QUEST_COMPLETED',
    REWARD_REDEEMED = 'REWARD_REDEEMED',
    APPROVAL_REQUEST = 'APPROVAL_REQUEST',
    SYSTEM = 'SYSTEM',
    REMINDER = 'REMINDER'
}

export interface INotification extends Document {
    recipientId: mongoose.Types.ObjectId;
    householdId: mongoose.Types.ObjectId;
    type: NotificationType;
    title: string;
    message: string;
    data?: Record<string, any>;
    isRead: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
    {
        recipientId: {
            type: Schema.Types.ObjectId,
            ref: 'FamilyMember',
            required: true
        },
        householdId: {
            type: Schema.Types.ObjectId,
            ref: 'Household',
            required: true
        },
        type: {
            type: String,
            enum: Object.values(NotificationType),
            required: true
        },
        title: {
            type: String,
            required: true
        },
        message: {
            type: String,
            required: true
        },
        data: {
            type: Map,
            of: Schema.Types.Mixed
        },
        isRead: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

// Index for efficient querying of user's notifications
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ householdId: 1 });

const Notification = mongoose.model<INotification>('Notification', notificationSchema);

export default Notification;
