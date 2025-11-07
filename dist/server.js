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
// silkpanda/momentum-api/momentum-api-556c5b7b5d534751fdc505eedf6113f20a02cc98/src/server.ts
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const mongodb_1 = require("mongodb");
const cors_1 = __importDefault(require("cors"));
const dotenv = __importStar(require("dotenv"));
// CRITICAL ADDITION: Import the authentication router
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
// NEW ADDITION: Import the household router
const householdRoutes_1 = __importDefault(require("./routes/householdRoutes"));
// NEW ADDITION: Import the task router
const taskRoutes_1 = __importDefault(require("./routes/taskRoutes"));
// NEW ADDITION: Import the store item router
const storeItemRoutes_1 = __importDefault(require("./routes/storeItemRoutes"));
// REMOVED: import transactionRouter from './routes/transactionRoutes';
// 1. Load Environment Variables
dotenv.config();
// Mandatory governance check: Ensure critical environment variables are set
const MONGO_URI = process.env.MONGO_URI || '';
const PORT = process.env.PORT || 3000;
if (!MONGO_URI) {
    console.error('CRITICAL ERROR: MONGO_URI environment variable is not set. Cannot connect to MongoDB.');
    process.exit(1);
}
// 2. Database Connection Setup
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
        console.log('MongoDB connection successful with Stable API.');
    }
    catch (error) {
        console.error('MongoDB connection failed:', error);
        // Exit process on failure
        process.exit(1);
    }
};
// 3. Express App Setup (Must be camelCase: app)
const app = (0, express_1.default)();
// Middleware
app.use((0, cors_1.default)()); // Allow cross-origin requests
app.use(express_1.default.json()); // Parse JSON bodies
// 4. API Routes
// Register Auth routes first
app.use('/api/v1/auth', authRoutes_1.default);
// NEW ROUTE REGISTRATION: Register Household routes
app.use('/api/v1/households', householdRoutes_1.default);
// NEW ROUTE REGISTRATION: Register Task routes
app.use('/api/v1/tasks', taskRoutes_1.default);
// NEW ROUTE REGISTRATION: Register Store Item routes
app.use('/api/v1/store-items', storeItemRoutes_1.default);
// REMOVED: app.use('/api/v1/transactions', transactionRouter);
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
//# sourceMappingURL=server.js.map