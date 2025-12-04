import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function clearDatabase() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/momentum';
        console.log('Connecting to MongoDB...');
        console.log('MongoDB URI:', mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@'));
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB successfully!\n');

        // Get all collection names from the database
        const collectionNames = [
            'familymembers',
            'households',
            'householdlinks',
            'childlinkcodes',
            'tasks',
            'quests',
            'storeitems',
            'transactions',
            'wishlistitems',
            'routines',
            'mealplans',
            'weeklymealplans',
            'recipes',
            'restaurants',
            'notifications',
        ];

        console.log('Starting database cleanup...\n');
        console.log('='.repeat(50));

        let totalDeleted = 0;

        // Delete all documents from each collection
        for (const collectionName of collectionNames) {
            try {
                if (!mongoose.connection.db) {
                    throw new Error('Database connection not established');
                }
                const collection = mongoose.connection.db.collection(collectionName);
                const count = await collection.countDocuments();

                if (count > 0) {
                    const result = await collection.deleteMany({});
                    console.log(`✓ ${collectionName}: Deleted ${result.deletedCount} documents`);
                    totalDeleted += result.deletedCount || 0;
                } else {
                    console.log(`○ ${collectionName}: Already empty`);
                }
            } catch (error: any) {
                console.error(`✗ ${collectionName}: Error - ${error.message}`);
            }
        }

        console.log('='.repeat(50));
        console.log(`\n✓ Database cleanup complete!`);
        console.log(`Total documents deleted: ${totalDeleted}\n`);

        // Verify all collections are empty
        console.log('Verifying collections are empty...');
        let allEmpty = true;
        for (const collectionName of collectionNames) {
            try {
                if (!mongoose.connection.db) {
                    throw new Error('Database connection not established');
                }
                const collection = mongoose.connection.db.collection(collectionName);
                const count = await collection.countDocuments();
                if (count > 0) {
                    console.log(`⚠ ${collectionName}: Still has ${count} documents`);
                    allEmpty = false;
                }
            } catch (error: any) {
                // Collection might not exist, which is fine
            }
        }

        if (allEmpty) {
            console.log('✓ All collections are empty!\n');
        } else {
            console.log('⚠ Some collections still have data\n');
        }

    } catch (error: any) {
        console.error('Error clearing database:', error.message);
    } finally {
        // Close the connection
        await mongoose.connection.close();
        console.log('Database connection closed.');
        process.exit(0);
    }
}

// Run the script
clearDatabase();
