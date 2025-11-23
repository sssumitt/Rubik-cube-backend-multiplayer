// server.js
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import csurf from 'csurf';

import config from './config/config.js';
import authRoutes from './routes/auth.js';
import statsRoutes from './routes/stats.js';
import protectedRoutes from './routes/protected.js';
import { sql } from './db.js';
import initSockets from './socket.js';

const app = express();
const PORT = config.port || 5000;

// ----------------------
// Global middleware
// ----------------------
app.use(express.json());
app.use(cookieParser());

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-CSRF-Token',
  ],
  exposedHeaders: ['X-CSRF-Token'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

app.use(
  csurf({
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
      sameSite: 'None',                               // allow cross-site
    },
  })
);

// ----------------------
// API routes
// ----------------------
app.use('/api/auth', authRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/protected', protectedRoutes);

// ----------------------
// Create HTTP server and attach Socket.io
// ----------------------
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  },
});

initSockets(io); // Initialize your Socket.io logic

// ----------------------
// Start server after DB check
// ----------------------
const startApp = async () => {
  try {
    await sql`SELECT 1`; // simple test query
    console.log('Database connection OK');

    // Start HTTP server (Express + Socket.io)
    httpServer.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Database connection failed:', err.message);
    process.exit(1); // stop the process if DB unreachable
  }
};

startApp();
