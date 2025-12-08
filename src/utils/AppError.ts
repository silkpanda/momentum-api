// src/utils/AppError.ts

class AppError extends Error {
  statusCode: number;

  status: string;

  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    // Call the parent constructor (Error) with the message
    super(message);

    this.statusCode = statusCode;
    // Set status to 'fail' for 4xx errors, 'error' for 5xx errors
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    
    // All errors created using this class are operational errors (i.e., user-facing)
    this.isOperational = true;

    // Capture stack trace for better debugging in non-production environments
    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;