// src/middleware/authMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler'; // Required for protect function
import FamilyMember, { IFamilyMember } from '../models/FamilyMember';
import AppError from '../utils/AppError';
import { Types } from 'mongoose';

// Define the shape of the user payload stored in the JWT
interface JwtPayload extends jwt.JwtPayload {
  id: string;
}

// CRITICAL FIX: Define the custom Request interface used in our controllers
// It extends Express's Request and adds the user document property
export interface AuthenticatedRequest extends Request {
  user?: IFamilyMember; // Adds the fetched user document to the request object
}

// Middleware function to protect routes
export const protect = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    let token;

    // 1. Get token and check if it exists
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(
        new AppError('You are not logged in! Please log in to get access.', 401),
      );
    }

    // 2. Verification token
    // We assume JWT_SECRET is set in the environment
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;

    // 3. Check if user still exists
    // The decoded token ID is the FamilyMember ID
    const currentUser = await FamilyMember.findById(decoded.id);

    if (!currentUser) {
      return next(
        new AppError(
          'The user belonging to this token no longer exists.',
          401,
        ),
      );
    }
    
    // 4. Check if user changed password after the token was issued 
    if (currentUser.passwordChangedAt) {
        const passwordChangedTimestamp = currentUser.passwordChangedAt.getTime() / 1000;
        
        // JWT payload 'iat' (issued at) is in seconds
        if (passwordChangedTimestamp > (decoded.iat as number)) {
            return next(
                new AppError('User recently changed password! Please log in again.', 401)
            );
        }
    }

    // GRANT ACCESS TO PROTECTED ROUTE
    // Attach the user document to the request for controller access (req.user)
    req.user = currentUser;
    
    next();
  },
);