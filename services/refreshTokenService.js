import jwt from 'jsonwebtoken';
import { sql } from '../db.js';


export async function saveRefreshToken(token, userId) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      throw new Error('Invalid token: No expiration time.');
    }
    
    const expiresAt = new Date(decoded.exp * 1000);

    
    // Step 1: Start the transaction
    await sql`BEGIN`;

    try {
      // Step 2: Delete any existing token for this user.
      await sql`DELETE FROM tokens WHERE user_id = ${userId}`;
      
      // Step 3: Insert the new token.
      await sql`
        INSERT INTO tokens (token, user_id, expires_at)
        VALUES (${token}, ${userId}, ${expiresAt})
      `;

      // Step 4: If both operations succeed, commit the transaction.
      await sql`COMMIT`;

    } catch (transactionError) {
      // Step 5a: If anything inside the transaction fails, roll everything back.
      await sql`ROLLBACK`;
      
      // Re-throw the error to be handled by the controller.
      throw transactionError;
    }

  } catch (err) {
    // This will catch the re-thrown error from the transaction block or any initial errors.
    console.error("Error saving refresh token:", err);
    throw err;
  }
}

