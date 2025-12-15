import request from 'supertest';
import { app } from '../src/server';
import mongoose from 'mongoose';

// Mock mongoose connect
jest.spyOn(mongoose, 'connect').mockImplementation(async () => mongoose);

describe('Health Check API', () => {
    afterAll(async () => {
        await mongoose.connection.close();
    });

    it('GET /api/health should return 200', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('API is running');
    });
});
