// check-real-database.ts
// Check the actual database with data

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

// Don't replace <dbname>, use it as-is
const MONGO_URI = process.env.MONGO_URI || '';

async function checkRealDatabase() {
    try {
        console.log('🔌 Connecting to MongoDB...\n');

        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected successfully!\n');

        const dbName = mongoose.connection.db.databaseName;
        console.log(`📊 Current database: ${dbName}\n`);

        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log(`📁 Collections:`);

        for (const collection of collections) {
            const count = await mongoose.connection.db.collection(collection.name).countDocuments();
            console.log(`   - ${collection.name}: ${count} documents`);
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected');
    }
}

checkRealDatabase();
