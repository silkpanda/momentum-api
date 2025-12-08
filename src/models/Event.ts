// src/models/Event.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface IEvent extends Document {
    householdId: Types.ObjectId;
    title: string;
    description?: string;
    location?: string;
    videoLink?: string;
    startDate: Date;
    endDate: Date;
    allDay: boolean;
    attendees: Types.ObjectId[]; // Array of FamilyMember IDs
    isRecurring: boolean;
    recurrenceType?: 'daily' | 'weekly' | 'monthly';
    reminderMinutes?: number;
    googleEventId?: string; // ID in Google Calendar
    calendarType: 'personal' | 'family'; // Which calendar it's synced to
    createdBy: Types.ObjectId; // FamilyMember ID
    createdAt?: Date;
    updatedAt?: Date;
}

const EventSchema = new Schema<IEvent>(
    {
        householdId: {
            type: Schema.Types.ObjectId,
            ref: 'Household',
            required: [true, 'Household ID is required'],
        },
        title: {
            type: String,
            required: [true, 'Event title is required'],
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        location: {
            type: String,
            trim: true,
        },
        videoLink: {
            type: String,
            trim: true,
        },
        startDate: {
            type: Date,
            required: [true, 'Start date is required'],
        },
        endDate: {
            type: Date,
            required: [true, 'End date is required'],
        },
        allDay: {
            type: Boolean,
            default: false,
        },
        attendees: [{
            type: Schema.Types.ObjectId,
            ref: 'FamilyMember',
        }],
        isRecurring: {
            type: Boolean,
            default: false,
        },
        recurrenceType: {
            type: String,
            enum: ['daily', 'weekly', 'monthly'],
        },
        reminderMinutes: {
            type: Number,
            min: 0,
        },
        googleEventId: {
            type: String,
        },
        calendarType: {
            type: String,
            enum: ['personal', 'family'],
            required: [true, 'Calendar type is required'],
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'FamilyMember',
            required: [true, 'Creator ID is required'],
        },
    },
    {
        timestamps: true,
        collection: 'events',
    },
);

// Index for efficient queries
EventSchema.index({ householdId: 1, startDate: 1 });
EventSchema.index({ attendees: 1 });
EventSchema.index({ googleEventId: 1 });

const Event = model<IEvent>('Event', EventSchema);

export default Event;
