// src/services/householdSharingService.ts
import mongoose, { Types } from 'mongoose';
import HouseholdLink from '../models/HouseholdLink';
import Household from '../models/Household';
import Task from '../models/Task';
import { emitMemberUpdate } from '../utils/websocketHelper';

/**
 * Fetch tasks from linked households that are shared with this household
 */
export const getSharedTasks = async (householdId: Types.ObjectId | string) => {
    try {
        const activeLinks = await HouseholdLink.find({
            $or: [{ household1: householdId }, { household2: householdId }],
            status: 'active',
            'sharingSettings.tasks': 'shared'
        });

        let allSharedTasks: any[] = [];

        for (const link of activeLinks) {
            const otherHouseholdId = link.household1.toString() === householdId.toString()
                ? link.household2
                : link.household1;

            const childFamilyMemberId = link.childId;

            // Find the member profile in the OTHER household for this child
            const otherHousehold = await Household.findById(otherHouseholdId);
            if (otherHousehold) {
                const otherMemberProfile = otherHousehold.memberProfiles.find(p =>
                    p.familyMemberId.toString() === childFamilyMemberId.toString()
                );

                if (otherMemberProfile) {
                    // Fetch tasks from the other household assigned to this child
                    const otherTasks = await Task.find({
                        householdId: otherHouseholdId,
                        assignedTo: otherMemberProfile._id
                    })
                        .populate('assignedTo', 'displayName profileColor')
                        .sort({ createdAt: -1 });

                    allSharedTasks = [...allSharedTasks, ...otherTasks];
                }
            }
        }

        return allSharedTasks;
    } catch (err) {
        console.error('Error fetching shared tasks:', err);
        return []; // Fail gracefully
    }
};

/**
 * Sync points updates to linked households
 */
export const syncPointsToLinkedHouseholds = async (
    io: any,
    childFamilyMemberId: Types.ObjectId | string,
    primaryHouseholdId: Types.ObjectId | string,
    pointsDelta: number
) => {
    try {
        const activeLinks = await HouseholdLink.find({
            childId: childFamilyMemberId,
            $or: [{ household1: primaryHouseholdId }, { household2: primaryHouseholdId }],
            status: 'active'
        });

        for (const link of activeLinks) {
            // Check if points are shared
            if (link.sharingSettings && link.sharingSettings.points === 'shared') {
                const otherHouseholdId = link.household1.toString() === primaryHouseholdId.toString()
                    ? link.household2
                    : link.household1;

                const otherHousehold = await Household.findById(otherHouseholdId);
                if (otherHousehold) {
                    const otherMemberProfile = otherHousehold.memberProfiles.find(p =>
                        p.familyMemberId.toString() === childFamilyMemberId.toString()
                    );

                    if (otherMemberProfile) {
                        // Update points in the other household
                        otherMemberProfile.pointsTotal = (otherMemberProfile.pointsTotal || 0) + pointsDelta;
                        await otherHousehold.save();

                        // Emit update to other household
                        if (io && otherMemberProfile._id) {
                            emitMemberUpdate(
                                io,
                                otherHouseholdId,
                                otherMemberProfile._id,
                                { pointsTotal: otherMemberProfile.pointsTotal }
                            );
                        }
                    }
                }
            }
        }
    } catch (syncError) {
        console.error('Error syncing points to linked households:', syncError);
    }
};
