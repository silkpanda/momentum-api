"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BCRYPT_SALT_ROUNDS = exports.JWT_EXPIRES_IN = exports.JWT_SECRET = void 0;
// MANDATORY: UPPER_SNAKE_CASE for Global Constants
// Use the secret from environment variables if available, otherwise use a fallback.
// This secret is used for signing and verifying JSON Web Tokens (JWT).
exports.JWT_SECRET = process.env.JWT_SECRET || 'YOUR_SUPER_SECURE_DEFAULT_SECRET';
// Time until the JWT token expires (e.g., 3 days)
exports.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '3d';
// The number of salt rounds for bcrypt password hashing
// A higher number is more secure but slower. 10 is standard.
exports.BCRYPT_SALT_ROUNDS = 10;
//# sourceMappingURL=constants.js.map