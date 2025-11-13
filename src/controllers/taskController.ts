import { Response } from 'express';
import mongoose, { Types } from 'mongoose'; 
import Task from '../models/Task';
import { AuthenticatedRequest } from '../middleware/authMiddleware'; 
import Household, { IHouseholdMemberProfile } from '../models/Household';
import { IFamilyMember } from '../models/FamilyMember'; 

// Helper interface for the data shape sent back to the frontend
interface ITransformedProfile {
  _id: string;
  displayName: string;
  profileColor?: string;
}

// Helper to handle standard model CRUD response
const handleResponse = (res: Response, status: number, message: string, data?: any): void => {
  res.status(status).json({
    status: status >= 400 ? 'fail' : 'success',
    message,
    data: data ? { task: data } : undefined,
  });
};

/**
 * Helper function to merge populated FamilyMember references on tasks
 * with their corresponding HouseholdMemberProfile data (displayName, profileColor).
 * This ensures the frontend gets the household-specific details.
 */
const mapAssignedMembers = (
  tasks: any[], // Mongoose task documents, with assignedToRefs populated (FamilyMember documents)
  memberProfiles: IHouseholdMemberProfile[] // The full memberProfiles array from the Household
): any[] => {
  return tasks.map(task => {
    // Convert Mongoose document to plain object for manipulation
    const taskObject = task.toObject ? task.toObject() : task; 

    // Check if assignedToRefs is present and populated
    if (!taskObject.assignedToRefs || taskObject.assignedToRefs.length === 0) {
      return {
        ...taskObject, 
        assignedToProfileIds: [], 
      };
    }

    // Map each FamilyMember to their corresponding HouseholdMemberProfile
    const assignedProfiles = (taskObject.assignedToRefs as IFamilyMember[])
      // Explicitly type parameters to resolve TypeScript implicit 'any' error (ts(7006))
      .map((familyMemberDoc: IFamilyMember) => {
        
        // Explicitly cast _id to Types.ObjectId to bypass the 'unknown' error (ts(18046))
        const familyMemberId = familyMemberDoc._id as Types.ObjectId;

        // Find the profile in the Household using the FamilyMember _id
        const profile = memberProfiles.find((p: IHouseholdMemberProfile) => 
            p.familyMemberId.toString() === familyMemberId.toString()
        );

        if (profile) {
          // Return the specific data shape the frontend expects
          return {
            _id: familyMemberId.toString(), // Use the explicitly typed ID
            displayName: profile.displayName,
            profileColor: profile.profileColor,
          } as ITransformedProfile;
        }
        return null; 
      })
      // FIX: Explicitly type parameter 'p' to eliminate the last 'implicit any' error.
      // Uses a type guard to filter out null values.
      .filter((p: ITransformedProfile | null): p is ITransformedProfile => p !== null);

    // Return the task object with the new, correctly structured field
    return {
      ...taskObject, 
      assignedToProfileIds: assignedProfiles, 
    };
  });
};


/**
 * Get all Tasks for the authenticated user's primary Household. (Phase 2.4)
 */
export const getAllTasks = async (req: AuthenticatedRequest, res: Response): Promise<void> => { 
  try {
    const householdId = req.householdId; 
    
    if (!householdId) {
      handleResponse(res, 400, 'Household context is missing from request.');
      return;
    }

    // 1. Fetch the Household's member profiles to use for mapping
    const household = await Household.findById(householdId).select('memberProfiles');

    if (!household) {
         handleResponse(res, 404, 'Household not found.');
         return;
    }

    // 2. Fetch Tasks and populate the FamilyMember references
    const rawTasks = await Task.find({ householdRefId: householdId })
        .populate('assignedToRefs'); 

    // 3. Transform the tasks to include the correct household profile data
    const tasks = mapAssignedMembers(rawTasks, household.memberProfiles);

    res.status(200).json({
      status: 'success',
      results: tasks.length,
      data: {
        tasks,
      },
    });
  } catch (err: any) {
    handleResponse(res, 500, 'Failed to retrieve tasks.', { error: err.message });
  }
};


/**
 * Create a new Task for the authenticated user's primary Household. (Phase 2.4)
 */
export const createTask = async (req: AuthenticatedRequest, res: Response): Promise<void> => { 
  try {
    const { taskName, description, pointsValue, recurrence, assignedToRefs } = req.body;
    
    // Validate mandatory fields
    if (!taskName || !pointsValue) {
      handleResponse(res, 400, 'Missing mandatory fields: taskName and pointsValue.');
      return;
    }
    
    const householdId = req.householdId;
    
    if (!householdId) {
      handleResponse(res, 400, 'Household context is missing from request.');
      return;
    }

    // Create the task, linking it to the Household from the JWT payload
    const newTask = await Task.create({
      taskName,
      description,
      pointsValue,
      recurrence,
      assignedToRefs,
      householdRefId: householdId, // CRITICAL: Scope task to the Household
      isCompleted: false, // Always start as false
    });

    handleResponse(res, 201, 'Task created successfully.', newTask);
    
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to create task.',
      error: err.message,
    });
  }
};

/**
 * Get a single Task by ID. (Phase 2.4)
 */
export const getTask = async (req: AuthenticatedRequest, res: Response): Promise<void> => { 
  try {
    const taskId = req.params.id;
    const householdId = req.householdId;
    
    // 1. Fetch the Household's member profiles
    const household = await Household.findById(householdId).select('memberProfiles');

    if (!household) {
         handleResponse(res, 404, 'Household not found.');
         return;
    }

    // 2. Fetch the Task and populate the FamilyMember references
    const rawTask = await Task.findOne({
      _id: taskId,
      householdRefId: householdId,
    }).populate('assignedToRefs'); 

    if (!rawTask) {
      handleResponse(res, 404, 'Task not found or does not belong to your household.');
      return;
    }
    
    // 3. Transform the single task
    const tasks = mapAssignedMembers([rawTask], household.memberProfiles);
    const task = tasks[0]; // Get the single transformed task

    handleResponse(res, 200, 'Task retrieved successfully.', task);
    
  } catch (err: any) {
    // FIX APPLIED: Use 'mongoose.Error.CastError' for correct TypeScript error checking
    if (err instanceof mongoose.Error.CastError) { 
      handleResponse(res, 400, 'Invalid task ID format.');
      return;
    }
    handleResponse(res, 500, 'Failed to retrieve task.', { error: err.message });
  }
};

/**
 * Update a Task by ID. (Phase 2.4)
 */
export const updateTask = async (req: AuthenticatedRequest, res: Response): Promise<void> => { 
  try {
    const taskId = req.params.id;
    const householdId = req.householdId;
    
    // Prevent updating householdRefId or isCompleted status via this general update endpoint
    const updates = { ...req.body };
    delete updates.householdRefId; 
    delete updates.isCompleted;

    // Find the task by ID and household ID, and then update it
    const updatedTask = await Task.findOneAndUpdate(
      {
        _id: taskId,
        householdRefId: householdId,
      },
      updates,
      { new: true, runValidators: true }
    );

    if (!updatedTask) {
      handleResponse(res, 404, 'Task not found or does not belong to your household.');
      return;
    }
    
    // The client expects the updated task to have the member profile data.
    
    // 1. Fetch the Household's member profiles
    const household = await Household.findById(householdId).select('memberProfiles');
    
    if (!household) {
      // Should not happen if a task was just found/updated, but for safety:
      handleResponse(res, 500, 'Failed to retrieve household for final data processing.');
      return;
    }

    // 2. Fetch the updated Task and populate the FamilyMember references
    const rawTask = await Task.findById(updatedTask._id).populate('assignedToRefs'); 
    
    // 3. Transform the single task
    const tasks = mapAssignedMembers([rawTask], household.memberProfiles);
    const task = tasks[0]; 

    handleResponse(res, 200, 'Task updated successfully.', task);
    
  } catch (err: any) {
    // FIX APPLIED: Use 'mongoose.Error.CastError' for correct TypeScript error checking
    if (err instanceof mongoose.Error.CastError) {
      handleResponse(res, 400, 'Invalid task ID format.');
      return;
    }
    res.status(500).json({
      status: 'error',
      message: 'Failed to update task.',
      error: err.message,
    });
  }
};

/**
 * Delete a Task by ID. (Phase 2.4)
 */
export const deleteTask = async (req: AuthenticatedRequest, res: Response): Promise<void> => { 
  try {
    const taskId = req.params.id;
    const householdId = req.householdId;

    // Find the task by ID AND ensure it belongs to the current household before deleting
    const deletedTask = await Task.findOneAndDelete({
      _id: taskId,
      householdRefId: householdId,
    });

    if (!deletedTask) {
      handleResponse(res, 404, 'Task not found or does not belong to your household.');
      return;
    }

    // Successful deletion returns 204 No Content
    res.status(204).json({
      status: 'success',
      data: null,
    });

  } catch (err: any) {
    // FIX APPLIED: Use 'mongoose.Error.CastError' for correct TypeScript error checking
    if (err instanceof mongoose.Error.CastError) {
      handleResponse(res, 400, 'Invalid task ID format.');
      return;
    }
    handleResponse(res, 500, 'Failed to delete task.', { error: err.message });
  }
};