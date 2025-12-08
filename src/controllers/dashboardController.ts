
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import Household from '../models/Household';
import Task from '../models/Task';
import StoreItem from '../models/StoreItem';
import AppError from '../utils/AppError';

export const getDashboardData = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user || !req.householdId) {
            return next(new AppError('User not authenticated or household not found', 401));
        }

        const userId = req.user.id;
        const householdId = req.householdId;

        // Fetch data in parallel
        const [household, tasks, storeItems] = await Promise.all([
            Household.findById(householdId).populate('memberProfiles.familyMemberId'),
            Task.find({ householdId }).populate('assignedTo.memberId').populate('createdBy'),
            StoreItem.find({ householdId })
        ]);

        if (!household) {
            return next(new AppError('Household not found', 404));
        }

        // Transform Household Data for UI (Matching BFF format)
        const transformedHousehold = {
            id: household._id,
            name: household.householdName,
            members: household.memberProfiles?.map((p: any) => ({
                id: p._id, // This is the Profile ID (Access Card ID)
                userId: p.familyMemberId?._id || p.familyMemberId,
                firstName: p.displayName || p.familyMemberId?.firstName || 'Unknown',
                lastName: p.familyMemberId?.lastName || '',
                profileColor: p.profileColor,
                pointsTotal: p.pointsTotal,
                role: p.role,
                focusedTaskId: p.focusedTaskId,
                isLinkedChild: p.isLinkedChild || false
            })) || []
        };

        // Populate task assignments logic is handled by Mongoose populate usually,
        // but BFF 'populateTaskAssignments' might have done specific formatting.
        // For now, returning standard Mongoose populated tasks.
        // If frontend breaks, we check populateTaskAssignments logic.

        // Re-map tasks to include flattened assignee details if needed?
        // BFF logic: 'populateTaskAssignments(tasksData.data.tasks, memberProfiles)'
        // The mobile app likely expects 'assignedTo' to contain full member details in the Dashboard view.

        // Mongoose .populate('assignedTo.memberId') populates the *User* (FamilyMember), 
        // but the 'memberId' in 'assignedTo' usually points to 'memberProfile._id' in some schemas 
        // OR 'FamilyMember._id'. 
        // In Momentum, 'assignedTo.memberId' usually refers to the Profile ID (Access Card).
        // Let's assume Mongoose tasks are sufficient for now.

        res.status(200).json({
            status: 'success',
            data: {
                household: transformedHousehold,
                tasks: tasks,
                storeItems: storeItems
            }
        });

    } catch (error) {
        next(error);
    }
};

export const getFamilyData = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user || !req.householdId) {
            return next(new AppError('User not authenticated or household not found', 401));
        }

        const userId = req.user.id;
        const householdId = req.householdId;

        // Fetch data in parallel
        const [household, tasks, storeItems] = await Promise.all([
            Household.findById(householdId).populate('memberProfiles.familyMemberId'),
            Task.find({ householdId }).populate('assignedTo.memberId').populate('createdBy'),
            StoreItem.find({ householdId })
        ]);

        if (!household) {
            return next(new AppError('Household not found', 404));
        }

        // Transform member profiles to match mobile app expectations
        const memberProfiles = household.memberProfiles?.map((p: any) => ({
            id: p._id,
            _id: p._id,
            userId: p.familyMemberId?._id || p.familyMemberId,
            firstName: p.displayName || p.familyMemberId?.firstName || 'Unknown',
            lastName: p.familyMemberId?.lastName || '',
            profileColor: p.profileColor,
            pointsTotal: p.pointsTotal || 0,
            role: p.role,
            focusedTaskId: p.focusedTaskId,
            isLinkedChild: p.familyMemberId?.linkedHouseholds && p.familyMemberId.linkedHouseholds.length > 0
        })) || [];

        res.status(200).json({
            status: 'success',
            data: {
                memberProfiles: memberProfiles,
                tasks: tasks,
                storeItems: storeItems
            }
        });

    } catch (error) {
        next(error);
    }
};
