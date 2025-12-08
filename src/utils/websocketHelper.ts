// src/utils/websocketHelper.ts
import { Server } from 'socket.io';
import { DefaultEventsMap } from 'socket.io/dist/typed-events';
import mongoose from 'mongoose';

// Define the shape of our WebSocket events
interface TaskEventPayload {
    task?: any;
    type?: 'create' | 'update' | 'delete' | 'reject';
    taskId?: string;
    memberUpdate?: any;
}

type IO = Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>;

/**
 * Helper to emit task-related events to a household
 */
export const emitTaskEvent = (
    io: IO,
    householdId: string | mongoose.Types.ObjectId,
    eventName: string,
    payload: TaskEventPayload
) => {
    if (!householdId) {
        console.warn('⚠️ Attempted to emit socket event without householdId');
        return;
    }

    const roomId = householdId.toString();

    // 1. Emit specific event (e.g., 'task_created')
    io.to(roomId).emit(eventName, payload);

    // 2. Emit legacy 'taskUpdated' event for backward compatibility
    // This triggers a full refresh on clients
    const legacyPayload = {
        type: payload.type || 'update',
        task: payload.task,
        taskId: payload.taskId,
        memberUpdate: payload.memberUpdate
    };

    io.to(roomId).emit('taskUpdated', legacyPayload);

    // Also emit generic 'task_updated' for granular listeners if it's not the specific event
    if (eventName !== 'task_updated') {
        io.to(roomId).emit('task_updated', payload);
    }
};

/**
 * Helper to emit member updates (e.g., points change)
 */
export const emitMemberUpdate = (
    io: IO,
    householdId: string | mongoose.Types.ObjectId,
    memberId: string | mongoose.Types.ObjectId,
    updates: any
) => {
    if (!householdId) return;

    io.to(householdId.toString()).emit('member_updated', {
        memberId,
        ...updates,
        timestamp: new Date()
    });
};
