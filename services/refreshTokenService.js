// services/refreshTokenService.js
import jwt from 'jsonwebtoken';
import { sql } from '../db.js';

/**
 * Saves or updates a refresh token for a user using "upsert" logic.
 */
export async function saveRefreshToken(token, userId) {
  try {
    const decoded = jwt.decode(token);
    const expiresAt = new Date(decoded.exp * 1000);

    // This command updates the token if user_id exists, or inserts if it doesn't.
    await sql`
      INSERT INTO tokens (token, user_id, expires_at)
      VALUES (${token}, ${userId}, ${expiresAt})
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        token = EXCLUDED.token, 
        issued_at = NOW(), 
        expires_at = EXCLUDED.expires_at;
    `;
  } catch (err) {
    console.error("Failed to save refresh token:", err);
    throw err;
  }
}