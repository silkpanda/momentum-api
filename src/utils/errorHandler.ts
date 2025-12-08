// src/utils/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import AppError from './AppError';

// Global error handler middleware
export const globalErrorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // 1. Handle AppError (Operational, trusted errors)
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  // 1.5 Handle JWT Errors
  if ((err as any).name === 'JsonWebTokenError') {
    return res.status(401).json({
      status: 'fail',
      message: 'Invalid token. Please log in again.',
    });
  }

  if ((err as any).name === 'TokenExpiredError') {
    return res.status(401).json({
      status: 'fail',
      message: 'Your token has expired! Please log in again.',
    });
  }

  // 2. Handle Mongoose/MongoDB Errors (CastError, ValidationError, DuplicateKey)
  // These often come as generic objects, so we might need to cast or inspect them.
  // For now, we'll treat them as generic 500s unless we specifically handle them,
  // but we'll log them safely.

  // 3. Handle Generic/Unknown Errors
  console.error('ERROR (Unhandled):', err);

  // In development, send the full error details
  if (process.env.NODE_ENV === 'development') {
    return res.status(500).json({
      status: 'error',
      message: 'Something went wrong on the server.',
      error: err,
      stack: (err as Error).stack, // Safe cast if it's an Error object
    });
  }

  // In production, send a generic message
  return res.status(500).json({
    status: 'error',
    message: 'Something went wrong on the server.',
  });
};