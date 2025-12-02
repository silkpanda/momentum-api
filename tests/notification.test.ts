import request from 'supertest';
import { app } from '../src/server';
import Notification from '../src/models/Notification';
import Household from '../src/models/Household';
import mongoose from 'mongoose';

// Mock the models
jest.mock('../src/models/Notification');
jest.mock('../src/models/Household');

// Mock the auth middleware
jest.mock('../src/middleware/authMiddleware', () => ({
    protect: (req: any, res: any, next: any) => {
        req.user = { _id: 'user123', firstName: 'TestUser' };
        req.householdId = 'household123';
        next();
    }
}));

// Mock mongoose connect to prevent actual connection
jest.spyOn(mongoose, 'connect').mockImplementation(async () => mongoose);

describe('Notification API', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/v1/notifications', () => {
        it('should return notifications for the current user', async () => {
            const mockNotifications = [
                { _id: 'notif1', title: 'Test 1', isRead: false },
                { _id: 'notif2', title: 'Test 2', isRead: true }
            ];

            // Mock Notification.find chain
            const mockFind = {
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue(mockNotifications)
            };
            (Notification.find as jest.Mock).mockReturnValue(mockFind);

            // Mock countDocuments
            (Notification.countDocuments as jest.Mock).mockResolvedValue(1);

            const res = await request(app).get('/api/v1/notifications');

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('success');
            expect(res.body.results).toBe(2);
            expect(res.body.unreadCount).toBe(1);
            expect(res.body.data.notifications).toHaveLength(2);
            expect(Notification.find).toHaveBeenCalledWith({ recipientId: 'user123' });
        });
    });

    describe('PATCH /api/v1/notifications/:id/read', () => {
        it('should mark a notification as read', async () => {
            const mockNotification = {
                _id: 'notif1',
                isRead: false,
                save: jest.fn().mockResolvedValue(true)
            };

            (Notification.findOne as jest.Mock).mockResolvedValue(mockNotification);

            const res = await request(app).patch('/api/v1/notifications/notif1/read');

            expect(res.status).toBe(200);
            expect(mockNotification.isRead).toBe(true);
            expect(mockNotification.save).toHaveBeenCalled();
        });

        it('should return 404 if notification not found', async () => {
            (Notification.findOne as jest.Mock).mockResolvedValue(null);

            const res = await request(app).patch('/api/v1/notifications/notif999/read');

            expect(res.status).toBe(404);
        });
    });

    describe('PATCH /api/v1/notifications/read-all', () => {
        it('should mark all notifications as read', async () => {
            (Notification.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 5 });

            const res = await request(app).patch('/api/v1/notifications/read-all');

            expect(res.status).toBe(200);
            expect(Notification.updateMany).toHaveBeenCalledWith(
                { recipientId: 'user123', isRead: false },
                { $set: { isRead: true } }
            );
        });
    });
});
