// silkpanda/momentum-api/momentum-api-8b94e0d79442b81f45f33d74e43f2675eb08824c/src/server.ts
import express from 'express';
import mongoose from 'mongoose';
import { ServerApiVersion } from 'mongodb';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';

// CRITICAL ADDITION: Import the authentication router
import authRouter from './routes/authRoutes';
// NEW ADDITION: Import the household router
import householdRouter from './routes/householdRoutes';
// NEW ADDITION: Import the task router
import taskRouter from './routes/taskRoutes';
// NEW ADDITION: Import the store item router
import storeItemRouter from './routes/storeItemRoutes';
// NEW ADDITION: Import the quest router
import questRouter from './routes/questRoutes';
// NEW ADDITION: Import the routine router
import routineRouter from './routes/routineRoutes';

// NEW IMPORTS FOR ERROR HANDLING
import AppError from './utils/appError';
// FIX APPLIED: Changed to named import for globalErrorHandler
import { globalErrorHandler } from './utils/errorHandler';

// 1. Load Environment Variables
dotenv.config();

// Mandatory governance check: Ensure critical environment variables are set
const MONGO_URI = process.env.MONGO_URI || '';
const PORT = (process.env.PORT && process.env.PORT !== '3000') ? process.env.PORT : 3001;

if (!MONGO_URI) {
  console.error(
    'CRITICAL ERROR: MONGO_URI environment variable is not set. Cannot connect to MongoDB.',
  );
  process.exit(1);
}

// 2. Database Connection Setup
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

    console.log('MongoDB connection successful with Stable API.');
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    // Exit process on failure
    process.exit(1);
  }
};

// 3. Express App Setup (Must be camelCase: app)
const app = express();
const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow all origins for now (BFF, Mobile, etc.)
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket: any) => {
  console.log('A user connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Middleware
app.use(cors()); // Allow cross-origin requests
app.use(express.json()); // Parse JSON bodies

// --- DEBUG LOGGER ---
// This will print exactly what the Core API receives from the BFF
app.use((req, res, next) => {
  console.log(`[Core API] Incoming Request: ${req.method} ${req.originalUrl}`);
  next();
});

// 4. API Routes
// Register Auth routes first
app.use('/api/v1/auth', authRouter);

// NEW ROUTE REGISTRATION: Register Household routes
// FIX: Double-mount to support both Singular (from BFF?) and Plural (Standard)
app.use('/api/v1/households', householdRouter);
app.use('/api/v1/household', householdRouter); // Safety Alias

// NEW ROUTE REGISTRATION: Register Task routes
app.use('/api/v1/tasks', taskRouter);
// NEW ROUTE REGISTRATION: Register Store Item routes
app.use('/api/v1/store-items', storeItemRouter);
// NEW ROUTE REGISTRATION: Register Quest routes
app.use('/api/v1/quests', questRouter);
// NEW ROUTE REGISTRATION: Register Routine routes
import mealRouter from './routes/mealRoutes';

// ...

app.use('/api/v1/routines', routineRouter);
app.use('/api/v1/meals', mealRouter); // Register meal routes


// Basic Health Check Route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'API is running', environment: process.env.NODE_ENV });
});

// 4b. UNHANDLED ROUTE HANDLER
// Catch all for routes not defined by the application
app.all('*', (req, res, next) => {
  // Use the AppError utility to create an operational error
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// 4c. GLOBAL ERROR HANDLER
// This middleware runs whenever next(err) is called with an error object
app.use(globalErrorHandler);

// 5. Start Server
const startServer = async () => {
  await connectDB();

  // Use httpServer.listen instead of app.listen
  httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

startServer();