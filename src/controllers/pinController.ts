// src/controllers/pinController.ts
import { Request, Response } from 'express';
import FamilyMember from '../models/FamilyMember';
import Household, { IHouseholdMemberProfile } from '../models/Household';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

/**
 * PIN Validation Rules
 * - Must be exactly 4 digits
 * - Cannot be all same digit (e.g., 1111)
 * - Cannot be sequential (e.g., 1234, 4321)
 */
function validatePin(pin: string): { valid: boolean; message?: string } {
    // Check if exactly 4 digits
    if (!/^\d{4}$/.test(pin)) {
        return { valid: false, message: 'PIN must be exactly 4 digits' };
    }

    // Check if all same digit
    if (/^(\d)\1{3}$/.test(pin)) {
        return { valid: false, message: 'PIN cannot be all the same digit (e.g., 1111)' };
    }

    // Check if sequential
    const digits = pin.split('').map(Number);
    const isAscending = digits.every((d, i) => i === 0 || d === digits[i - 1] + 1);
    const isDescending = digits.every((d, i) => i === 0 || d === digits[i - 1] - 1);

    if (isAscending || isDescending) {
        return { valid: false, message: 'PIN cannot be sequential (e.g., 1234, 4321)' };
    }

    return { valid: true };
}

/**
 * @route   POST /api/auth/setup-pin
 * @desc    Set up PIN for a user (first time or reset)
 * @access  Private (requires authentication)
 */
export const setupPin = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { pin } = req.body;
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        if (!pin) {
            return res.status(400).json({ status: 'error', message: 'PIN is required' });
        }

        // Validate PIN
        const validation = validatePin(pin);
        if (!validation.valid) {
            return res.status(400).json({ status: 'error', message: validation.message });
        }

        // Find user and update PIN
        const user = await FamilyMember.findById(userId);
        if (!user) {
            return res.status(404).json({ status: 'error', message: 'User not found' });
        }

        user.pin = pin; // Will be hashed by pre-save hook
        user.pinSetupCompleted = true;
        await user.save();

        res.status(200).json({
            status: 'success',
            message: 'PIN set up successfully',
            data: {
                pinSetupCompleted: true,
            },
        });
    } catch (error) {
        console.error('Error setting up PIN:', error);
        res.status(500).json({ status: 'error', message: 'Failed to set up PIN' });
    }
};

/**
 * @route   POST /api/auth/verify-pin
 * @desc    Verify PIN for a user or household member
 * @access  Public (but requires memberId)
 */
export const verifyPin = async (req: Request, res: Response) => {
    try {
        const { pin, memberId, householdId } = req.body;

        if (!pin) {
            return res.status(400).json({ status: 'error', message: 'PIN is required' });
        }

        if (!memberId || !householdId) {
            return res.status(400).json({ status: 'error', message: 'Member ID and Household ID are required' });
        }

        // Find the household and member
        const household = await Household.findById(householdId);
        if (!household) {
            return res.status(404).json({ status: 'error', message: 'Household not found' });
        }

        // Find the member in the household
        const member = household.memberProfiles.find((m: IHouseholdMemberProfile) => m._id?.toString() === memberId);
        let user;
        if (!member) {
            // Fallback: treat memberId as a FamilyMember ID directly
            console.log('[PIN Verify] Member not found in household, trying direct FamilyMember lookup');
            user = await FamilyMember.findById(memberId).select('+pin');
            if (!user) {
                return res.status(404).json({ status: 'error', message: 'User not found' });
            }
        } else {
            // Get the FamilyMember document with PIN
            user = await FamilyMember.findById(member.familyMemberId).select('+pin');
            if (!user) {
                return res.status(404).json({ status: 'error', message: 'User not found' });
            }
        }


        // Check if PIN is set up
        if (!user.pin || !user.pinSetupCompleted) {
            console.log('[PIN Verify] PIN not set up:', { hasPin: !!user.pin, pinSetupCompleted: user.pinSetupCompleted });
            return res.status(400).json({
                status: 'error',
                message: 'PIN not set up for this user',
                requiresSetup: true,
            });
        }

        console.log('[PIN Verify] Comparing PIN for user:', user._id);
        console.log('[PIN Verify] PIN hash length:', user.pin?.length);
        console.log('[PIN Verify] Entered PIN length:', pin.length);

        // Verify PIN
        // Determine member profile and user
        let memberProfile: IHouseholdMemberProfile | null = null;
        let userDoc: any;
        if (member) {
            memberProfile = member;
            userDoc = await FamilyMember.findById(member.familyMemberId).select('+pin');
        } else {
            // member not found, treat memberId as FamilyMember ID
            console.log('[PIN Verify] Member not found in household, using memberId as FamilyMember ID');
            userDoc = await FamilyMember.findById(memberId).select('+pin');
        }
        if (!userDoc) {
            return res.status(404).json({ status: 'error', message: 'User not found' });
        }

        // Check if PIN is set up
        if (!userDoc.pin || !userDoc.pinSetupCompleted) {
            console.log('[PIN Verify] PIN not set up:', { hasPin: !!userDoc.pin, pinSetupCompleted: userDoc.pinSetupCompleted });
            return res.status(400).json({
                status: 'error',
                message: 'PIN not set up for this user',
                requiresSetup: true,
            });
        }

        console.log('[PIN Verify] Comparing PIN for user:', userDoc._id);
        console.log('[PIN Verify] PIN hash length:', userDoc.pin?.length);
        console.log('[PIN Verify] Entered PIN length:', pin.length);

        // Verify PIN
        const isValid = await userDoc.comparePin(pin);
        console.log('[PIN Verify] PIN comparison result:', isValid);

        if (!isValid) {
            return res.status(401).json({ status: 'error', message: 'Incorrect PIN' });
        }

        // Update last verification timestamp
        userDoc.lastPinVerification = new Date();
        await userDoc.save();

        res.status(200).json({
            status: 'success',
            message: 'PIN verified successfully',
            data: {
                verified: true,
                memberId: memberProfile ? memberProfile._id : userDoc._id,
                userId: userDoc._id,
                firstName: memberProfile ? memberProfile.displayName : userDoc.firstName,
                role: memberProfile ? memberProfile.role : undefined,
            },
        });
    } catch (error) {
        console.error('Error verifying PIN:', error);
        res.status(500).json({ status: 'error', message: 'Failed to verify PIN' });
    }
};

/**
 * @route   PUT /api/auth/change-pin
 * @desc    Change existing PIN (requires old PIN)
 * @access  Private (requires authentication)
 */
export const changePin = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { oldPin, newPin } = req.body;
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        if (!oldPin || !newPin) {
            return res.status(400).json({ status: 'error', message: 'Old PIN and new PIN are required' });
        }

        // Validate new PIN
        const validation = validatePin(newPin);
        if (!validation.valid) {
            return res.status(400).json({ status: 'error', message: validation.message });
        }

        // Find user with PIN
        const user = await FamilyMember.findById(userId).select('+pin');
        if (!user) {
            return res.status(404).json({ status: 'error', message: 'User not found' });
        }

        // Verify old PIN
        if (!user.pin) {
            return res.status(400).json({ status: 'error', message: 'No PIN set up' });
        }

        const isValid = await user.comparePin(oldPin);
        if (!isValid) {
            return res.status(401).json({ status: 'error', message: 'Incorrect old PIN' });
        }

        // Update to new PIN
        user.pin = newPin; // Will be hashed by pre-save hook
        await user.save();

        res.status(200).json({
            status: 'success',
            message: 'PIN changed successfully',
        });
    } catch (error) {
        console.error('Error changing PIN:', error);
        res.status(500).json({ status: 'error', message: 'Failed to change PIN' });
    }
};

/**
 * @route   GET /api/auth/pin-status
 * @desc    Check if user has PIN set up
 * @access  Private (requires authentication)
 */
export const getPinStatus = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const user = await FamilyMember.findById(userId);
        if (!user) {
            return res.status(404).json({ status: 'error', message: 'User not found' });
        }

        res.status(200).json({
            status: 'success',
            data: {
                pinSetupCompleted: user.pinSetupCompleted || false,
                lastPinVerification: user.lastPinVerification,
            },
        });
    } catch (error) {
        console.error('Error getting PIN status:', error);
        res.status(500).json({ status: 'error', message: 'Failed to get PIN status' });
    }
};
