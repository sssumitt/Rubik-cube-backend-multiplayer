import { Router } from 'express';
import csurf from 'csurf';

import {
  getCsrfToken,
  registerUser,
  loginUser,
  refreshToken,
  logoutUser
} from '../controllers/auth.js';

import { googleAuth, googleCallback } from '../controllers/auth.js';

const csrfProtection = csurf({ cookie: true });

const router = Router();
// GOOGLE OAUTH ROUTES 
router.get('/google', googleAuth);
router.get('/google/callback', csrfProtection, googleCallback);
router.get('/csrf-token', csrfProtection, getCsrfToken);
router.post('/register', csrfProtection, registerUser);
router.post('/login', csrfProtection, loginUser);
router.post('/refresh', csrfProtection, refreshToken);
router.post('/logout', csrfProtection, logoutUser);

export default router;
