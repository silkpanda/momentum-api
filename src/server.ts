import * as dotenv from 'dotenv';
// 1. Load Environment Variables FIRST
dotenv.config();

import express from 'express';
import mongoose from 'mongoose';
import { ServerApiVersion } from 'mongodb';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';

// Import routers
import authRouter from './routes/authRoutes';
import householdRouter from './routes/householdRoutes';
import taskRouter from './routes/taskRoutes';
import storeItemRouter from './routes/storeItemRoutes';
import questRouter from './routes/questRoutes';
import routineRouter from './routes/routineRoutes';
import mealRouter from './routes/mealRoutes';
import wishlistRouter from './routes/wishlistRoutes';
import pinRouter from './routes/pin';
import householdLinkRouter from './routes/householdLinkRoutes';
import notificationRouter from './routes/notificationRoutes';
import googleCalendarRouter from './routes/googleCalendarRoutes';
import calendarManagementRouter from './routes/calendarManagementRoutes';

// Import error handling
import AppError from './utils/AppError';
import { globalErrorHandler } from './utils/errorHandler';

// 2. Validate Required Environment Variables
const requiredEnvVars = [
  'MONGO_URI',
  'JWT_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ CRITICAL ERROR: Missing required environment variables:');
  missingEnvVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\nPlease set these variables in your .env file before starting the server.');
  process.exit(1);
}

// Warn about optional but recommended variables
const recommendedEnvVars = ['NODE_ENV', 'JWT_EXPIRES_IN', 'PORT'];
const missingRecommended = recommendedEnvVars.filter(varName => !process.env[varName]);

if (missingRecommended.length > 0) {
  console.warn('⚠️  WARNING: Missing recommended environment variables (using defaults):');
  missingRecommended.forEach(varName => {
    console.warn(`   - ${varName}`);
  });
}

// Extract validated environment variables
const MONGO_URI = process.env.MONGO_URI!; // Safe to use ! because we validated above
const PORT = (process.env.PORT && process.env.PORT !== '3000') ? process.env.PORT : 3001;

// 3. Database Connection Setup
const connectDB = async () => {
  try {
    // MANDATORY: Stable API Configuration (Phase 1.2)
    await mongoose.connect(MONGO_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });

    console.log('✅ MongoDB connection successful with Stable API.');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    // Exit process on failure
    process.exit(1);
  }
};

// 4. Express App Setup (Must be camelCase: app)
const app = express();
const httpServer = createServer(app);

// CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002', // Mobile BFF
    'http://localhost:8081',
    'https://momentum-web.onrender.com',
    'https://momentum-mobile-bff.onrender.com'
  ];

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`Blocked CORS request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

export const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

io.on('connection', (socket: any) => {
  console.log('A user connected:', socket.id);

  socket.on('join_household', (householdId: string) => {
    if (householdId) {
      socket.join(householdId);
      console.log(`Socket ${socket.id} joined household room: ${householdId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Make io accessible in controllers via req.app.get('io')
app.set('io', io);

// Middleware
app.use(cors(corsOptions)); // Allow cross-origin requests
app.use(express.json()); // Parse JSON bodies

// --- DEBUG LOGGER ---
// This will print exactly what the Core API receives from the BFF
app.use((req, res, next) => {
  console.log(`[Core API] Incoming Request: ${req.method} ${req.originalUrl}`);
  next();
});

// 5. API Routes
// Register Auth routes first
app.use('/api/v1/auth', authRouter);

// Register PIN routes
app.use('/api/v1/pin', pinRouter);

// Register Household routes
app.use('/api/v1/households', householdRouter);

// Register Household Link routes (child sharing)
app.use('/api/v1/household', householdLinkRouter);

// Register Task routes
app.use('/api/v1/tasks', taskRouter);
// Register Store Item routes
app.use('/api/v1/store-items', storeItemRouter);
// Register Quest routes
app.use('/api/v1/quests', questRouter);
// Register Routine routes
app.use('/api/v1/routines', routineRouter);
// Register Meal routes
app.use('/api/v1/meals', mealRouter);
// Register Wishlist routes
app.use('/api/v1/wishlist', wishlistRouter);
// Register Notification routes
app.use('/api/v1/notifications', notificationRouter);
// Register Google Calendar routes
app.use('/api/v1/calendar/google', googleCalendarRouter);
// Register Calendar Management routes (list, create, verify)
app.use('/api/v1/calendar', calendarManagementRouter);


// Basic Health Check Route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'API is running', environment: process.env.NODE_ENV });
});

// 6. UNHANDLED ROUTE HANDLER
// Catch all for routes not defined by the application
app.all('*', (req, res, next) => {
  // Use the AppError utility to create an operational error
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// 7. GLOBAL ERROR HANDLER
// This middleware runs whenever next(err) is called with an error object
app.use(globalErrorHandler);

// 8. Start Server
const startServer = async () => {
  await connectDB();

  // Use httpServer.listen instead of app.listen
  httpServer.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
};

if (require.main === module) {
  startServer();
}

export { app, httpServer };