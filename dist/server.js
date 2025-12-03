"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpServer = exports.app = exports.io = void 0;
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const mongodb_1 = require("mongodb");
const cors_1 = __importDefault(require("cors"));
const dotenv = __importStar(require("dotenv"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
// Import routers
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const householdRoutes_1 = __importDefault(require("./routes/householdRoutes"));
const taskRoutes_1 = __importDefault(require("./routes/taskRoutes"));
const storeItemRoutes_1 = __importDefault(require("./routes/storeItemRoutes"));
const questRoutes_1 = __importDefault(require("./routes/questRoutes"));
const routineRoutes_1 = __importDefault(require("./routes/routineRoutes"));
const mealRoutes_1 = __importDefault(require("./routes/mealRoutes"));
const wishlistRoutes_1 = __importDefault(require("./routes/wishlistRoutes"));
const pin_1 = __importDefault(require("./routes/pin"));
const householdLinkRoutes_1 = __importDefault(require("./routes/householdLinkRoutes"));
const notificationRoutes_1 = __importDefault(require("./routes/notificationRoutes"));
const googleCalendarRoutes_1 = __importDefault(require("./routes/googleCalendarRoutes"));
// Import error handling
const AppError_1 = __importDefault(require("./utils/AppError"));
const errorHandler_1 = require("./utils/errorHandler");
// 1. Load Environment Variables
dotenv.config();
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
const MONGO_URI = process.env.MONGO_URI; // Safe to use ! because we validated above
const PORT = (process.env.PORT && process.env.PORT !== '3000') ? process.env.PORT : 3001;
// 3. Database Connection Setup
const connectDB = async () => {
    try {
        // MANDATORY: Stable API Configuration (Phase 1.2)
        await mongoose_1.default.connect(MONGO_URI, {
            serverApi: {
                version: mongodb_1.ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            },
        });
        console.log('✅ MongoDB connection successful with Stable API.');
    }
    catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        // Exit process on failure
        process.exit(1);
    }
};
// 4. Express App Setup (Must be camelCase: app)
const app = (0, express_1.default)();
exports.app = app;
const httpServer = (0, http_1.createServer)(app);
exports.httpServer = httpServer;
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
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        }
        else {
            console.warn(`Blocked CORS request from origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
};
exports.io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    }
});
exports.io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    socket.on('join_household', (householdId) => {
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
app.set('io', exports.io);
// Middleware
app.use((0, cors_1.default)(corsOptions)); // Allow cross-origin requests
app.use(express_1.default.json()); // Parse JSON bodies
// --- DEBUG LOGGER ---
// This will print exactly what the Core API receives from the BFF
app.use((req, res, next) => {
    console.log(`[Core API] Incoming Request: ${req.method} ${req.originalUrl}`);
    next();
});
// 5. API Routes
// Register Auth routes first
app.use('/api/v1/auth', authRoutes_1.default);
// Register PIN routes
app.use('/api/v1/pin', pin_1.default);
// Register Household routes
app.use('/api/v1/households', householdRoutes_1.default);
// Register Household Link routes (child sharing)
app.use('/api/v1/household', householdLinkRoutes_1.default);
// Register Task routes
app.use('/api/v1/tasks', taskRoutes_1.default);
// Register Store Item routes
app.use('/api/v1/store-items', storeItemRoutes_1.default);
// Register Quest routes
app.use('/api/v1/quests', questRoutes_1.default);
// Register Routine routes
app.use('/api/v1/routines', routineRoutes_1.default);
// Register Meal routes
app.use('/api/v1/meals', mealRoutes_1.default);
// Register Wishlist routes
app.use('/api/v1/wishlist', wishlistRoutes_1.default);
// Register Notification routes
app.use('/api/v1/notifications', notificationRoutes_1.default);
// Register Google Calendar routes
app.use('/api/v1/calendar/google', googleCalendarRoutes_1.default);
// Basic Health Check Route
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'API is running', environment: process.env.NODE_ENV });
});
// 6. UNHANDLED ROUTE HANDLER
// Catch all for routes not defined by the application
app.all('*', (req, res, next) => {
    // Use the AppError utility to create an operational error
    next(new AppError_1.default(`Can't find ${req.originalUrl} on this server!`, 404));
});
// 7. GLOBAL ERROR HANDLER
// This middleware runs whenever next(err) is called with an error object
app.use(errorHandler_1.globalErrorHandler);
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
//# sourceMappingURL=server.js.map