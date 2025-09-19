import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { sql } from '../db.js';
import config from '../config/config.js';
import { issueTokens } from '../services/tokenService.js';
import { saveRefreshToken } from '../services/refreshTokenService.js';
import { getGoogleAuthURL, getGoogleUser } from '../services/googleOAuthService.js';


/**
 * GET CSRF token
 */
export const getCsrfToken = (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
};


/**
 * Register a new user and log them in immediately.
 * --- IMPROVEMENT: Login after register for better UX ---
 */
export const registerUser = async (req, res) => {
  const { username, password } = req.body;

  try {
    const existing = await sql`SELECT id FROM users WHERE username = ${username}`;

    if (existing.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Insert the new user and return their ID and username
    const newUserRows = await sql`
      INSERT INTO users (username, password_hash) 
      VALUES (${username}, ${passwordHash})
      RETURNING id, username
    `;
    
    const newUser = newUserRows[0];

    const { accessToken, refreshToken } = issueTokens(res, { id: newUser.id, username: newUser.username });
    await saveRefreshToken(refreshToken, newUser.id);
   
    res.status(201).json({ 
      user: { id: newUser.id, username: newUser.username },
      csrfToken: req.csrfToken() 
    });

  } catch (err) {
    console.error('Register DB error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const loginUser = async (req, res) => {
  const { username, password } = req.body;

  try {
    const rows = await sql`
      SELECT id, username, password_hash FROM users WHERE username = ${username}
    `;
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const userPayload = { id: user.id, username: user.username };
    
    const { accessToken, refreshToken } = issueTokens(res, userPayload);
    await saveRefreshToken(refreshToken, user.id);

    // The frontend needs both the user data and the CSRF token
    res.json({ 
      user: userPayload,
      csrfToken: req.csrfToken() 
    });

  } catch (err) {
    console.error('Login DB error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};


/**
 * Refresh JWT tokens.
 * --- FIX: Returns user object along with the CSRF token ---
 */
export const refreshToken = async (req, res) => {
  
  const oldToken = req.cookies.refresh_token;
  if (!oldToken) {
    return res.status(401).json({ error: 'Missing refresh token' });
  }

  try {
    // Verify the token is in our database
    const tokenRows = await sql`SELECT user_id FROM tokens WHERE token = ${oldToken}`;

    if (tokenRows.length === 0) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    const userId = tokenRows[0].user_id;

    // Verify the token signature and expiration
    try {
      jwt.verify(oldToken, config.publicKey, { algorithms: ['RS256'] });
    } catch {
      await sql`DELETE FROM tokens WHERE token = ${oldToken}`;
      return res.status(401).json({ error: 'Expired or malformed token' });
    }

    // --- Fetch the user data to send back to the frontend ---
    const userRows = await sql`SELECT id, username FROM users WHERE id = ${userId}`;
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userRows[0];
    const userPayload = { id: user.id, username: user.username };

    // Perform token rotation
    await sql`DELETE FROM tokens WHERE token = ${oldToken}`;

    const { accessToken, refreshToken: newRefresh } = issueTokens(res, userPayload);
    await saveRefreshToken(newRefresh, user.id);

    // The frontend needs both the user data and the new CSRF token
    res.json({ 
      user: userPayload,
      csrfToken: req.csrfToken() 
    });

  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};


/**
 * Log out the user.
 */
export const logoutUser = async (req, res) => {
  const token = req.cookies.refresh_token;

  if (token) {
    try {
      await sql`DELETE FROM tokens WHERE token = ${token}`;
    } catch (err) {
      console.error('Logout DB error:', err);
    }
  }

  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/auth/refresh' });
  res.clearCookie('_csrf', { path: '/' }); 

  res.status(200).json({ message: 'Logged out successfully' });
};

/**
 * Redirect to Google OAuth consent page.
 */
export const googleAuth = (req, res) => {
  res.redirect(getGoogleAuthURL());    
};


/**
 * Handle Google OAuth callback.
 */
export const googleCallback = async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('Missing ?code query param from Google');
  }

  try {
    const { email, sub } = await getGoogleUser(code);
    let user;

    // Find or create user (upsert logic)
    const existingUser = await sql`SELECT id, username FROM users WHERE google_id = ${sub} OR username = ${email}`;

    if (existingUser.length > 0) {
      user = existingUser[0];
      // If user exists by email but google_id is null, link it
      if (!existingUser[0].google_id) {
        await sql`UPDATE users SET google_id = ${sub} WHERE id = ${user.id}`;
      }
    } else {
      // Create new user
      const newUserRows = await sql`
        INSERT INTO users (username, google_id) VALUES (${email}, ${sub})
        RETURNING id, username
      `;
      user = newUserRows[0];
    }
    
    // Issue tokens and cookies
    const userPayload = { id: user.id, username: user.username };
    const { refreshToken } = issueTokens(res, userPayload);
    await saveRefreshToken(refreshToken, user.id);

    // Redirect to the frontend. The AuthContext will then call /refresh and get the user data.
    res.redirect(`${process.env.FRONTEND_URL}/?oauth=success`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('Authentication failed.');
  }
};
