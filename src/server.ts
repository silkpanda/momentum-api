import express from 'express';
import mongoose from 'mongoose';
import { ServerApiVersion } from 'mongodb'; 
import cors from 'cors';
import * as dotenv from 'dotenv';
// CRITICAL ADDITION: Import the authentication router
import authRouter from './routes/authRoutes'; 

// 1. Load Environment Variables
dotenv.config();

// Mandatory governance check: Ensure critical environment variables are set
const MONGO_URI = process.env.MONGO_URI || '';
const PORT = process.env.PORT || 3000;

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

// Middleware
app.use(cors()); // Allow cross-origin requests
app.use(express.json()); // Parse JSON bodies

// 4. API Routes
// Register Auth routes first
app.use('/api/v1/auth', authRouter);

// Basic Health Check Route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'API is running', environment: process.env.NODE_ENV });
});

// 5. Start Server
const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

startServer();