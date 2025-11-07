import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { Types } from 'mongoose';
import FamilyMember from '../models/FamilyMember';
import { JWT_SECRET } from '../config/constants';
import { IFamilyMember } from '../models/FamilyMember';

// Extend the Express Request interface to include the user and household information
// This allows other middleware/controllers to access the authenticated user data.
export interface IAuthRequest extends Request {
  user?: IFamilyMember;
  householdId?: Types.ObjectId; // The primary household context from the JWT payload
}

// -----------------------------------------------------------------------------
// 1. JWT Protection Middleware (Auth Guard)
// -----------------------------------------------------------------------------

export const protect = async (
  req: IAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    // 1. Get token and check if it exists
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      // Example: 'Bearer tokenValue' -> ['Bearer', 'tokenValue']
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      res.status(401).json({
        status: 'fail',
        message: 'You are not logged in. Please log in to get access.',
      });
      return;
    }

    // 2. Verification token
    // The jwt.verify returns the payload if verification succeeds.
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    // The JWT payload contains the user ID ('id') and their primary household context ('householdRefId')
    const { id: userId, householdRefId } = decoded;

    // 3. Check if user still exists
    // We explicitly exclude the password since it's sensitive.
    const currentUser = await FamilyMember.findById(userId);

    if (!currentUser) {
      res.status(401).json({
        status: 'fail',
        message: 'The user belonging to this token no longer exists.',
      });
      return;
    }

    // 4. Grant access to protected route
    // Inject user and household ID into the request object for downstream controllers
    req.user = currentUser;
    req.householdId = new Types.ObjectId(householdRefId); 
    next();
  } catch (err: any) {
    // Handle specific JWT errors (e.g., expired, invalid signature)
    let message = 'Invalid token.';
    if (err.name === 'TokenExpiredError') {
      message = 'Your token has expired. Please log in again.';
    } else if (err.name === 'JsonWebTokenError') {
      message = 'Invalid token signature.';
    }

    res.status(401).json({
      status: 'fail',
      message: message,
    });
  }
};