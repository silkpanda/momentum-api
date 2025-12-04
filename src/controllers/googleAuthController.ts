// src/controllers/googleAuthController.ts
import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { Types } from 'mongoose';
import { OAuth2Client } from 'google-auth-library';
import FamilyMember from '../models/FamilyMember';
import Household, { IHouseholdMemberProfile } from '../models/Household';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/constants';
import AppError from '../utils/AppError';
import asyncHandler from 'express-async-handler';
import { createNewCalendar } from '../services/googleCalendarService';
import { google } from 'googleapis';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const signToken = (id: string, householdId: string): string => {
    const payload = { id, householdId };
    const options: SignOptions = {
        expiresIn: JWT_EXPIRES_IN as any,
    };
    return jwt.sign(payload, JWT_SECRET, options);
};

export const googleAuth = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { idToken } = req.body;

    if (!idToken) {
        return next(new AppError('ID token is required', 400));
    }

    try {
        // Verify the Google ID token
        const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        if (!payload) {
            return next(new AppError('Invalid Google token', 401));
        }

        const { sub: googleId, email, given_name: firstName, family_name: lastName } = payload;

        if (!email || !googleId) {
            return next(new AppError('Invalid Google account data', 400));
        }

        // Check if user already exists (by googleId or email)
        let familyMember = await FamilyMember.findOne({
            $or: [{ googleId }, { email }]
        });

        let isNewUser = false;
        let householdId: Types.ObjectId;
        let household;

        if (familyMember) {
            // Existing user - login
            // Update googleId if not set (for users who signed up with email first)
            if (!familyMember.googleId) {
                familyMember.googleId = googleId;
                await familyMember.save();
            }

            // Find their household
            household = await Household.findOne({
                'memberProfiles.familyMemberId': familyMember._id,
                'memberProfiles.role': 'Parent',
            });

            if (!household) {
                return next(new AppError('User does not belong to any household as a Parent.', 401));
            }

            householdId = household._id as Types.ObjectId;

        } else {
            // New user - signup
            isNewUser = true;

            // Create new user with Google auth
            familyMember = await FamilyMember.create({
                firstName: firstName || 'User',
                lastName: lastName || '',
                email,
                googleId,
                onboardingCompleted: false,
                // Password is not required for Google OAuth users
            });

            const parentId: Types.ObjectId = familyMember._id as Types.ObjectId;

            // Create a default household profile
            // Note: Display name and color will be set during onboarding
            const creatorProfile: IHouseholdMemberProfile = {
                familyMemberId: parentId,
                displayName: firstName || 'User',
                profileColor: '#6366f1', // Default color
                role: 'Parent',
                pointsTotal: 0,
            };

            // Create household with a temporary name
            household = await Household.create({
                householdName: `${firstName}'s Household`,
                memberProfiles: [creatorProfile],
            });

            householdId = household._id as Types.ObjectId;
        }

        const token = signToken((familyMember._id as Types.ObjectId).toString(), householdId.toString());

        const userWithRole = {
            ...familyMember.toObject(),
            role: 'Parent',
        };

        res.status(isNewUser ? 201 : 200).json({
            status: 'success',
            token,
            data: {
                parent: userWithRole,
                primaryHouseholdId: householdId,
                isNewUser,
                needsOnboarding: isNewUser || !familyMember.onboardingCompleted,
            },
        });

    } catch (err: any) {
        console.error('Google auth error:', err);
        return next(new AppError(`Google authentication failed: ${err.message}`, 500));
    }
});

// Complete onboarding for Google OAuth users
export const completeOnboarding = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { userId, householdId, displayName, profileColor, calendarChoice, selectedCalendarId } = req.body;

    if (!userId || !householdId || !displayName || !profileColor) {
        return next(new AppError('Missing required fields', 400));
    }

    try {
        // Update user's onboarding status
        const familyMember = await FamilyMember.findById(userId);
        if (!familyMember) {
            return next(new AppError('User not found', 404));
        }

        familyMember.onboardingCompleted = true;
        await familyMember.save();

        // Update household profile with chosen display name and color
        const household = await Household.findById(householdId);
        if (!household) {
            return next(new AppError('Household not found', 404));
        }

        const memberProfile = household.memberProfiles.find(
            (p) => p.familyMemberId.toString() === userId
        );

        if (memberProfile) {
            memberProfile.displayName = displayName;
            memberProfile.profileColor = profileColor;
            await household.save();
        }

        // Handle calendar creation/sync based on calendarChoice
        if (calendarChoice && familyMember.googleCalendar?.accessToken) {
            try {
                if (calendarChoice === 'create') {
                    // Create new Google Calendar
                    console.log('Creating new Google Calendar for user...');
                    const newCalendar = await createNewCalendar(
                        familyMember.googleCalendar.accessToken,
                        {
                            summary: 'Momentum Family Calendar',
                            description: 'Calendar for family tasks and events',
                        }
                    );

                    // Store the new calendar ID
                    if (!familyMember.googleCalendar) {
                        familyMember.googleCalendar = {
                            accessToken: '',
                            refreshToken: '',
                            expiryDate: 0,
                        };
                    }
                    familyMember.googleCalendar.selectedCalendarId = newCalendar.calendarId;
                    await familyMember.save();

                    console.log(`✅ Created calendar: ${newCalendar.calendarId}`);

                } else if (calendarChoice === 'sync' && selectedCalendarId) {
                    // Store the selected calendar ID
                    console.log(`Syncing with existing calendar: ${selectedCalendarId}`);
                    if (!familyMember.googleCalendar) {
                        familyMember.googleCalendar = {
                            accessToken: '',
                            refreshToken: '',
                            expiryDate: 0,
                        };
                    }
                    familyMember.googleCalendar.selectedCalendarId = selectedCalendarId;
                    await familyMember.save();

                    console.log(`✅ Synced with calendar: ${selectedCalendarId}`);
                }
            } catch (calendarError: any) {
                console.error('Calendar setup error:', calendarError);
                // Don't fail onboarding if calendar setup fails
                // User can set it up later
            }
        }

        res.status(200).json({
            status: 'success',
            data: {
                user: familyMember,
                household,
            },
        });

    } catch (err: any) {
        return next(new AppError(`Failed to complete onboarding: ${err.message}`, 500));
    }
});

// OAuth-based Google authentication (includes calendar permissions)
export const googleOAuth = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { code, redirectUri } = req.body;

    if (!code) {
        return next(new AppError('Authorization code is required', 400));
    }

    try {
        // Create OAuth client
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            redirectUri || 'http://localhost:3000/auth/google/callback'
        );

        // Exchange code for tokens
        const { tokens } = await oauth2Client.getToken(code);

        if (!tokens.access_token || !tokens.id_token) {
            return next(new AppError('Failed to get tokens from Google', 500));
        }

        // Verify ID token to get user info
        oauth2Client.setCredentials(tokens);
        const ticket = await client.verifyIdToken({
            idToken: tokens.id_token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        if (!payload) {
            return next(new AppError('Invalid Google token', 401));
        }

        const { sub: googleId, email, given_name: firstName, family_name: lastName } = payload;

        if (!email || !googleId) {
            return next(new AppError('Invalid Google account data', 400));
        }

        // Check if user already exists
        let familyMember = await FamilyMember.findOne({
            $or: [{ googleId }, { email }]
        });

        let isNewUser = false;
        let householdId: Types.ObjectId;
        let household;

        if (familyMember) {
            // Existing user - update calendar tokens
            if (!familyMember.googleId) {
                familyMember.googleId = googleId;
            }

            if (!familyMember.googleCalendar) {
                familyMember.googleCalendar = {
                    accessToken: '',
                    refreshToken: '',
                    expiryDate: 0,
                };
            }
            familyMember.googleCalendar.accessToken = tokens.access_token;
            familyMember.googleCalendar.refreshToken = tokens.refresh_token || familyMember.googleCalendar.refreshToken;
            familyMember.googleCalendar.expiryDate = tokens.expiry_date || Date.now() + 3600000;

            await familyMember.save();

            household = await Household.findOne({
                'memberProfiles.familyMemberId': familyMember._id,
                'memberProfiles.role': 'Parent',
            });

            if (!household) {
                return next(new AppError('User does not belong to any household as a Parent.', 401));
            }

            householdId = household._id as Types.ObjectId;

        } else {
            // New user - create with calendar tokens
            isNewUser = true;

            familyMember = await FamilyMember.create({
                firstName: firstName || 'User',
                lastName: lastName || '',
                email,
                googleId,
                onboardingCompleted: false,
                googleCalendar: {
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token!,
                    expiryDate: tokens.expiry_date || Date.now() + 3600000,
                },
            });

            const parentId: Types.ObjectId = familyMember._id as Types.ObjectId;

            const creatorProfile: IHouseholdMemberProfile = {
                familyMemberId: parentId,
                displayName: firstName || 'User',
                profileColor: '#6366f1',
                role: 'Parent',
                pointsTotal: 0,
            };

            household = await Household.create({
                householdName: `${firstName}'s Household`,
                memberProfiles: [creatorProfile],
            });

            householdId = household._id as Types.ObjectId;
        }

        const token = signToken((familyMember._id as Types.ObjectId).toString(), householdId.toString());

        const userWithRole = {
            ...familyMember.toObject(),
            role: 'Parent',
        };

        res.status(isNewUser ? 201 : 200).json({
            status: 'success',
            token,
            data: {
                parent: userWithRole,
                primaryHouseholdId: householdId,
                isNewUser,
                needsOnboarding: isNewUser || !familyMember.onboardingCompleted,
            },
        });

    } catch (err: any) {
        console.error('Google OAuth error:', err);
        return next(new AppError(`Google authentication failed: ${err.message}`, 500));
    }
});
