// src/routes/pin.ts
import express from 'express';
import rateLimit from 'express-rate-limit';
import { setupPin, verifyPin, changePin, getPinStatus } from '../controllers/pinController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

// Strict rate limiter for PIN verification: 5 attempts per 15 minutes per member.
// Keyed on memberId+householdId so limits are per-member, not per IP.
const pinVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => `pin:${req.body?.householdId ?? 'unknown'}:${req.body?.memberId ?? 'unknown'}`,
    message: { status: 'error', message: 'Too many PIN attempts. Try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Protected routes (require authentication)
router.post('/setup-pin', protect, setupPin);
router.put('/change-pin', protect, changePin);
router.get('/pin-status', protect, getPinStatus);

// Public route (for shared device access) — rate limited to prevent brute force
router.post('/verify-pin', pinVerifyLimiter, verifyPin);

export default router;
