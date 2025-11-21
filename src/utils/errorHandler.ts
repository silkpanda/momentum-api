// src/utils/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import AppError from './appError';

// Global error handler middleware
// CHANGED TO NAMED EXPORT: export const globalErrorHandler
export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Check if it's an operational error (created with AppError class)
  if (err instanceof AppError) {
    // Operational error: send the custom status code and message
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      // Only include the stack trace if not in production
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  // Non-operational or unhandled error (e.g., database connection failure, programming error)
  // Send a generic 500 response in production for security.
  console.error('ERROR (Unhandled):', err); // Log the unhandled error for server inspection

  return res.status(500).json({
    status: 'error',
    message: 'Something went wrong on the server.',
    // In development, provide more detail
    ...(process.env.NODE_ENV === 'development' && {
      error: err,
      message: err.message,
      stack: err.stack
    }),
  });
};