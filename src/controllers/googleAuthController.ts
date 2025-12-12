// src/controllers/googleAuthController.ts
import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { Types } from 'mongoose';
import { OAuth2Client } from 'google-auth-library';
import asyncHandler from 'express-async-handler';
import { google } from 'googleapis';
import bcrypt from 'bcryptjs';
import FamilyMember from '../models/FamilyMember';
import Household, { IHouseholdMemberProfile } from '../models/Household';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/constants';
import AppError from '../utils/AppError';
import { createNewCalendar } from '../services/googleCalendarService';

// Lazy load client to ensure env vars are loaded
const getOAuthClient = () => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables must be set');
    }
    return new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
};

const signToken = (id: string, householdId: string): string => {
    const payload = { id, householdId };
    const options: SignOptions = {
        expiresIn: JWT_EXPIRES_IN as any,
    };
    return jwt.sign(payload, JWT_SECRET, options);
};

export const googleAuth = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { idToken, serverAuthCode } = req.body;

    if (!idToken) {
        return next(new AppError('ID token is required', 400));
    }

    try {
        // Verify the Google ID token
        const client = getOAuthClient();
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

        // If serverAuthCode is present, exchange it for tokens
        let googleCalendarTokens = null;
        if (serverAuthCode) {
            try {
                // Use a client with empty redirect URI for mobile/native exchange
                // This matches what works in the exchangeCodeForTokens controller
                const exchangeClient = new OAuth2Client(
                    process.env.GOOGLE_CLIENT_ID,
                    process.env.GOOGLE_CLIENT_SECRET,
                    '' // Mobile apps typically need empty string or postmessage
                );

                console.log('Exchanging serverAuthCode for tokens...');
                const { tokens } = await exchangeClient.getToken(serverAuthCode);

                console.log('Token exchange result keys:', Object.keys(tokens));
                console.log('Has access_token:', !!tokens.access_token);
                console.log('Has refresh_token:', !!tokens.refresh_token);

                if (tokens.access_token) {
                    console.log('Token exchange successful');
                    googleCalendarTokens = {
                        accessToken: tokens.access_token,
                        refreshToken: tokens.refresh_token,
                        expiryDate: tokens.expiry_date || Date.now() + 3600000,
                    };
                }
            } catch (tokenError: any) {
                console.error('Failed to exchange serverAuthCode:', tokenError.message);
                console.error('Detailed token error:', JSON.stringify(tokenError, null, 2));

                // CRITICAL: If exchange fails, we must signal to clear existing tokens
                // so we don't leave the user in a broken state with an invalid refresh token
                googleCalendarTokens = {
                    accessToken: '',
                    refreshToken: '',
                    expiryDate: 0,
                    error: true // flag to indicate failure
                };
            }
        } else {
            console.log('[Google Auth] No serverAuthCode provided in request body');
        }

        if (familyMember) {
            // Existing user - login
            // Update googleId if not set (for users who signed up with email first)
            if (!familyMember.googleId) {
                familyMember.googleId = googleId;
            }

            // Update calendar tokens if we got new ones
            if (googleCalendarTokens) {
                if (!familyMember.googleCalendar) {
                    familyMember.googleCalendar = {
                        accessToken: '',
                        refreshToken: '',
                        expiryDate: 0,
                    };
                }

                if ((googleCalendarTokens as any).error) {
                    console.warn('[Google Auth] Token exchange failed - clearing stored tokens to prevent loop');
                    familyMember.googleCalendar.accessToken = '';
                    familyMember.googleCalendar.refreshToken = '';
                    familyMember.googleCalendar.expiryDate = 0;
                } else {
                    // Always update access token
                    familyMember.googleCalendar.accessToken = googleCalendarTokens.accessToken;

                    // Only update refresh token if we got a new one
                    // Google only provides refresh tokens on FIRST authorization
                    if (googleCalendarTokens.refreshToken) {
                        console.log('[Google Auth] Got new refresh token');
                        familyMember.googleCalendar.refreshToken = googleCalendarTokens.refreshToken;
                    } else {
                        console.log('[Google Auth] No new refresh token (expected after first auth)');
                        // Keep existing refresh token if we have one
                        if (!familyMember.googleCalendar.refreshToken) {
                            console.warn('[Google Auth] WARNING: No refresh token available - calendar sync will fail');
                        }
                    }

                    familyMember.googleCalendar.expiryDate = googleCalendarTokens.expiryDate;
                }
            }

            await familyMember.save();

            // Find their household
            household = await Household.findOne({
                'memberProfiles.familyMemberId': familyMember._id,
                'memberProfiles.role': 'Parent',
            });

            if (!household) {
                // RECOVERY: User exists but has no household (orphaned). Create one.
                console.warn(`User ${familyMember._id} exists but has no household. Creating default recovery household.`);

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

                // Reset onboarding status so they go through setup again to fix things
                familyMember.onboardingCompleted = false;
                await familyMember.save();
            } else {
                householdId = household._id as Types.ObjectId;
            }

        } else {
            // New user - signup
            isNewUser = true;

            // Create new user with Google auth
            const newMemberData: any = {
                firstName: firstName || 'User',
                lastName: lastName || '',
                email,
                googleId,
                onboardingCompleted: false,
                // Password is not required for Google OAuth users
            };

            if (googleCalendarTokens) {
                newMemberData.googleCalendar = {
                    accessToken: googleCalendarTokens.accessToken,
                    refreshToken: googleCalendarTokens.refreshToken || '',
                    expiryDate: googleCalendarTokens.expiryDate,
                };
            }

            familyMember = await FamilyMember.create(newMemberData);

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
    const {
        userId,
        householdId,
        householdName,
        inviteCode,
        displayName,
        profileColor,
        familyColor, // NEW
        calendarChoice,
        selectedCalendarId,
        familyCalendarChoice, // NEW
        selectedFamilyCalendarId, // NEW
        pin
    } = req.body;

    // Validate required fields
    if (!userId || !displayName || !profileColor || !pin) {
        return next(new AppError('Missing required fields', 400));
    }

    // Must have either householdId OR householdName
    if (!householdId && !householdName) {
        return next(new AppError('Either householdId or householdName is required', 400));
    }

    // Validate PIN
    if (!/^\d{4}$/.test(pin)) {
        return next(new AppError('PIN must be exactly 4 digits', 400));
    }

    try {
        // Update user's onboarding status
        const familyMember = await FamilyMember.findById(userId).select('+googleCalendar');
        if (!familyMember) {
            return next(new AppError('User not found', 404));
        }

        console.log('[Onboarding] Setting up PIN for user:', userId);
        console.log('[Onboarding] PIN received:', pin ? '****' : 'MISSING');

        // Store PIN (will be hashed by pre-save hook)
        console.log('[Onboarding] Raw PIN before save:', pin);
        familyMember.pin = pin;
        familyMember.pinSetupCompleted = true;
        familyMember.onboardingCompleted = true;
        await familyMember.save();

        // Verify the saved PIN by re-fetching
        const verifyUser = await FamilyMember.findById(userId).select('+pin');
        console.log('[Onboarding] PIN hash after save:', `${verifyUser?.pin?.slice(0, 20)}...`);
        console.log('[Onboarding] PIN isModified after save:', familyMember.isModified('pin'));

        // Test comparison immediately after save
        if (verifyUser) {
            const testResult = await bcrypt.compare(pin, verifyUser.pin!);
            console.log('[Onboarding] Immediate PIN compare test:', testResult);
        }

        console.log('[Onboarding] PIN saved successfully');
        console.log('[Onboarding] pinSetupCompleted:', familyMember.pinSetupCompleted);

        // Get or create household
        let household;
        let actualHouseholdId = householdId;
        const currentContextHouseholdId = (req as any).householdId; // From the current token (Placeholder)

        if (inviteCode) {
            // JOINING VIA INVITE CODE
            console.log(`[Onboarding] Attempting to join with invite code: ${inviteCode}`);
            household = await Household.findOne({ inviteCode: inviteCode.toUpperCase() });

            if (!household) {
                return next(new AppError('Invalid invite code', 404));
            }

            // Check if already a member
            const isMember = household.memberProfiles.some(
                (p) => p.familyMemberId.toString() === userId.toString()
            );

            if (!isMember) {
                // Add to household
                const newProfile: IHouseholdMemberProfile = {
                    familyMemberId: userId,
                    displayName,
                    profileColor,
                    role: 'Parent',
                    pointsTotal: 0,
                };
                household.memberProfiles.push(newProfile);
                await household.save();
                console.log(`[Onboarding] User joined household: ${household._id}`);

                // --- ZOMBIE HOUSEHOLD CLEANUP ---
                // If user came from a placeholder household (single member), delete it
                if (currentContextHouseholdId && currentContextHouseholdId.toString() !== household._id.toString()) {
                    try {
                        const oldHousehold = await Household.findById(currentContextHouseholdId);
                        if (oldHousehold && oldHousehold.memberProfiles.length <= 1) {
                            console.log(`[Onboarding] Cleaning up placeholder household: ${currentContextHouseholdId}`);
                            await Household.findByIdAndDelete(currentContextHouseholdId);
                            // Note: No need to delete Tasks/StoreItems as they shouldn't exist yet for a placeholder
                        }
                    } catch (cleanupErr) {
                        console.error('[Onboarding] Failed to cleanup placeholder household:', cleanupErr);
                        // Non-blocking error
                    }
                }
            } else {
                // Already a member, just update profile if needed
                const memberProfile = household.memberProfiles.find(
                    (p) => p.familyMemberId.toString() === userId.toString()
                );
                if (memberProfile) {
                    memberProfile.displayName = displayName;
                    memberProfile.profileColor = profileColor;
                    await household.save();
                }
            }

            actualHouseholdId = (household._id as Types.ObjectId).toString();

        } else if (householdId) {
            // Try to find existing household
            household = await Household.findById(householdId);

            if (!household) {
                // Fallback if ID provided but not found (rare)
                console.log('[Onboarding] Household ID provided but not found');
            } else {
                // Update existing household
                console.log('[Onboarding] Updating existing household');

                // Update household name if provided
                if (householdName) {
                    household.householdName = householdName;
                }
                if (familyColor) {
                    household.familyColor = familyColor;
                }

                const memberProfile = household.memberProfiles.find(
                    (p) => p.familyMemberId.toString() === userId
                );

                if (memberProfile) {
                    memberProfile.displayName = displayName;
                    memberProfile.profileColor = profileColor;
                    await household.save();
                }
                actualHouseholdId = (household._id as Types.ObjectId).toString();
            }
        }

        if (!household) {
            // No household found - create one
            console.log('[Onboarding] Creating new household');

            if (!householdName) {
                // Use default name if somehow missing
                const safeHouseholdName = `${displayName || 'Family'}'s Household`;
                // return next(new AppError('Household name is required when creating a new household', 400));
                // Relaxed: create with default if missing, though frontend should prevent this
                console.warn('[Onboarding] No household name provided, using default');

                // Reuse existing logic
                const parentId: Types.ObjectId = familyMember._id as Types.ObjectId;
                const creatorProfile: IHouseholdMemberProfile = {
                    familyMemberId: parentId,
                    displayName,
                    profileColor,
                    role: 'Parent',
                    pointsTotal: 0,
                };
                household = await Household.create({
                    householdName: safeHouseholdName,
                    familyColor: familyColor || '#8B5CF6',
                    memberProfiles: [creatorProfile],
                });
                actualHouseholdId = (household._id as Types.ObjectId).toString();
            } else {
                const parentId: Types.ObjectId = familyMember._id as Types.ObjectId;

                const creatorProfile: IHouseholdMemberProfile = {
                    familyMemberId: parentId,
                    displayName,
                    profileColor,
                    role: 'Parent',
                    pointsTotal: 0,
                };

                household = await Household.create({
                    householdName,
                    familyColor: familyColor || '#8B5CF6',
                    memberProfiles: [creatorProfile],
                });
                actualHouseholdId = (household._id as Types.ObjectId).toString();
            }

            console.log('[Onboarding] Created new household:', actualHouseholdId);

            // --- ZOMBIE CLEANUP (UPDATE SCENARIO) ---
            // If we created a *new* household, but we were already in a placeholder (different ID),
            // and that placeholder is empty/single, delete it.
            // This happens if user chooses "Create New" instead of "Update Current" (though usually we update current).
            // But if `householdId` was NOT passed, we might be creating a fresh one.
            // Be careful to not delete the household we just created.

            if (currentContextHouseholdId && currentContextHouseholdId.toString() !== actualHouseholdId) {
                try {
                    const oldHousehold = await Household.findById(currentContextHouseholdId);
                    // Only delete if it looks like a placeholder (1 member) AND it's not the one we just made
                    if (oldHousehold && oldHousehold.memberProfiles.length <= 1) {
                        console.log(`[Onboarding] Cleaning up previous placeholder household: ${currentContextHouseholdId}`);
                        await Household.findByIdAndDelete(currentContextHouseholdId);
                    }
                } catch (cleanupErr) {
                    console.error('[Onboarding] Failed to cleanup placeholder household:', cleanupErr);
                }
            }
        } else if (!inviteCode && householdId) {
            // We already handled "Update Existing" inside the "else" block of "if (!household)"?
            // No, the logic flow above was:
            // 1. if (inviteCode) -> join
            // 2. else if (householdId) -> find
            // 3. if (!household) -> create

            // So the "else" block of "if (!household)" handles Creation.
            // The "Update" happened inside block 2.
            // Logic is sound.
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
                        },
                        familyMember.googleCalendar.refreshToken
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

        // Handle FAMILY calendar creation/sync
        if (familyCalendarChoice && familyMember.googleCalendar?.accessToken && household) {
            try {
                const { accessToken, refreshToken } = familyMember.googleCalendar;

                if (familyCalendarChoice === 'create') {
                    // Create new Family Calendar
                    console.log('Creating new Family Calendar...');
                    const familyCalName = `${householdName || 'Family'} Calendar`;
                    const newFamilyCalendar = await createNewCalendar(
                        accessToken,
                        {
                            summary: familyCalName,
                            description: 'Shared family events and activities',
                        },
                        refreshToken
                    );

                    // Store in household
                    household.familyCalendarId = newFamilyCalendar.calendarId;
                    await household.save();

                    console.log(`✅ Created family calendar: ${newFamilyCalendar.calendarId}`);

                } else if (familyCalendarChoice === 'sync' && selectedFamilyCalendarId) {
                    // Sync with existing calendar
                    console.log(`Syncing with existing family calendar: ${selectedFamilyCalendarId}`);
                    household.familyCalendarId = selectedFamilyCalendarId;
                    await household.save();

                    console.log(`✅ Synced with family calendar: ${selectedFamilyCalendarId}`);
                }
            } catch (familyCalendarError: any) {
                console.error('Family calendar setup error:', familyCalendarError);
                // Don't fail onboarding if family calendar setup fails
            }
        }

        // Generate a new token with the possibly new householdId
        const newToken = signToken(userId, actualHouseholdId);

        res.status(200).json({
            status: 'success',
            token: newToken,
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
        // Force consent to ensure we get a refresh token
        const { tokens } = await oauth2Client.getToken(code);

        if (!tokens.access_token || !tokens.id_token) {
            return next(new AppError('Failed to get tokens from Google', 500));
        }

        // Verify ID token to get user info
        oauth2Client.setCredentials(tokens);

        // Use the same client for verification if possible, or create new one
        const client = getOAuthClient();
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
                    refreshToken: tokens.refresh_token || '', // Handle missing refresh token
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
        console.error('Error stack:', err.stack);
        return next(new AppError(`Google authentication failed: ${err.message}`, 500));
    }
});
