// src/services/pointsService.ts
import mongoose, { Types } from 'mongoose';
import Household from '../models/Household';
import { updateMemberStreak, applyMultiplier } from '../utils/streakCalculator';
import { syncPointsToLinkedHouseholds } from './householdSharingService';

/**
 * Award points to a member, handling multipliers and syncing to linked households
 */
export const awardPointsToMember = async (
    io: any,
    householdId: Types.ObjectId | string,
    memberId: Types.ObjectId | string, // The memberProfile ID
    basePoints: number,
    shouldUpdateStreak: boolean = false
) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const household = await Household.findById(householdId).session(session);
        if (!household) throw new Error('Household not found');

        const memberProfile = household.memberProfiles.find((p) => p._id?.equals(memberId));
        if (!memberProfile) throw new Error('Member profile not found');

        // 1. Calculate Streak (if applicable)
        let streakUpdated = false;
        if (shouldUpdateStreak) {
            const streakUpdate = updateMemberStreak(
                memberProfile.currentStreak || 0,
                memberProfile.longestStreak || 0,
                memberProfile.lastCompletionDate,
                true
            );
            memberProfile.currentStreak = streakUpdate.currentStreak;
            memberProfile.longestStreak = streakUpdate.longestStreak;
            memberProfile.lastCompletionDate = streakUpdate.lastCompletionDate;
            memberProfile.streakMultiplier = streakUpdate.streakMultiplier;
            streakUpdated = true;
        }

        // 2. Apply Multiplier
        const currentMultiplier = memberProfile.streakMultiplier || 1.0;
        const pointsToAward = applyMultiplier(basePoints, currentMultiplier);

        // 3. Update Points (primary household)
        memberProfile.pointsTotal = (memberProfile.pointsTotal || 0) + pointsToAward;
        await household.save({ session });

        // 4. Sync to Linked Households (within the same transaction)
        if (memberProfile.familyMemberId) {
            await syncPointsToLinkedHouseholds(io, memberProfile.familyMemberId, householdId, pointsToAward, session);
        }

        await session.commitTransaction();

        return {
            pointsAwarded: pointsToAward,
            multiplier: currentMultiplier,
            updatedProfile: memberProfile,
            streakUpdated
        };
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};
