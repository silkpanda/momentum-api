// check-database.ts
// Check MongoDB connection and list databases

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI?.replace('<dbname>', 'momentum') || '';

async function checkDatabase() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        console.log(`   URI: ${MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\n`);

        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected successfully!\n');

        // Get the current database name
        const dbName = mongoose.connection.db.databaseName;
        console.log(`📊 Current database: ${dbName}\n`);

        // List all collections in this database
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log(`📁 Collections in '${dbName}':`);

        if (collections.length === 0) {
            console.log('   (No collections found - database might be empty)\n');
        } else {
            for (const collection of collections) {
                const count = await mongoose.connection.db.collection(collection.name).countDocuments();
                console.log(`   - ${collection.name}: ${count} documents`);
            }
        }

        // Try to list all databases (requires admin privileges)
        try {
            const admin = mongoose.connection.db.admin();
            const { databases } = await admin.listDatabases();
            console.log(`\n🗄️  All databases on this cluster:`);
            for (const db of databases) {
                console.log(`   - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
            }
        } catch (err) {
            console.log('\n⚠️  Cannot list all databases (requires admin privileges)');
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected');
    }
}

checkDatabase();
