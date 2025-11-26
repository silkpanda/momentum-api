// src/routes/pin.ts
import express from 'express';
import { setupPin, verifyPin, changePin, getPinStatus } from '../controllers/pinController';
import { protect } from '../middleware/auth';

const router = express.Router();

// Protected routes (require authentication)
router.post('/setup-pin', protect, setupPin);
router.put('/change-pin', protect, changePin);
router.get('/pin-status', protect, getPinStatus);

// Public route (for shared device access)
router.post('/verify-pin', verifyPin);

export default router;
