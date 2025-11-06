// MANDATORY: UPPER_SNAKE_CASE for Global Constants
// Use the secret from environment variables if available, otherwise use a fallback.
// This secret is used for signing and verifying JSON Web Tokens (JWT).
export const JWT_SECRET: string = process.env.JWT_SECRET || 'YOUR_SUPER_SECURE_DEFAULT_SECRET';

// Time until the JWT token expires (e.g., 3 days)
export const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '3d';

// The number of salt rounds for bcrypt password hashing
// A higher number is more secure but slower. 10 is standard.
export const BCRYPT_SALT_ROUNDS: number = 10;