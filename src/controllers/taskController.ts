import { Response } from 'express';
import mongoose, { Types } from 'mongoose'; // <-- FIX: Import mongoose itself to access mongoose.Error.CastError
import Task from '../models/Task';
import { AuthenticatedRequest } from '../middleware/authMiddleware'; // <-- FIX: Renamed to AuthenticatedRequest

// Helper to handle standard model CRUD response
const handleResponse = (res: Response, status: number, message: string, data?: any): void => {
  res.status(status).json({
    status: status >= 400 ? 'fail' : 'success',
    message,
    data: data ? { task: data } : undefined,
  });
};

/**
 * Get all Tasks for the authenticated user's primary Household. (Phase 2.4)
 */
export const getAllTasks = async (req: AuthenticatedRequest, res: Response): Promise<void> => { // <-- FIX: Renamed to AuthenticatedRequest
  try {
    // Tasks must be retrieved within the user's household context
    const householdId = req.householdId; 
    
    if (!householdId) {
      handleResponse(res, 400, 'Household context is missing from request.');
      return;
    }

    const tasks = await Task.find({ householdRefId: householdId }).populate('assignedToRefs', 'firstName profileColor');

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
export const createTask = async (req: AuthenticatedRequest, res: Response): Promise<void> => { // <-- FIX: Renamed to AuthenticatedRequest
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
export const getTask = async (req: AuthenticatedRequest, res: Response): Promise<void> => { // <-- FIX: Renamed to AuthenticatedRequest
  try {
    const taskId = req.params.id;
    const householdId = req.householdId;
    
    // Find the task by ID AND ensure it belongs to the current household
    const task = await Task.findOne({
      _id: taskId,
      householdRefId: householdId,
    }).populate('assignedToRefs', 'firstName'); // Populate to get assigned names

    if (!task) {
      handleResponse(res, 404, 'Task not found or does not belong to your household.');
      return;
    }

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
export const updateTask = async (req: AuthenticatedRequest, res: Response): Promise<void> => { // <-- FIX: Renamed to AuthenticatedRequest
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

    handleResponse(res, 200, 'Task updated successfully.', updatedTask);
    
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
export const deleteTask = async (req: AuthenticatedRequest, res: Response): Promise<void> => { // <-- FIX: Renamed to AuthenticatedRequest
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