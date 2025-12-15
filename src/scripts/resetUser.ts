
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Import Models
import FamilyMember from '../models/FamilyMember';
import Household from '../models/Household';
import Event from '../models/Event';
import Task from '../models/Task';
import Quest from '../models/Quest';
import Routine from '../models/Routine';
import MealPlan from '../models/MealPlan';
import WishlistItem from '../models/WishlistItem';
import StoreItem from '../models/StoreItem';
// Add others as needed

// Load env vars
const envPath = path.resolve(__dirname, '../../.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

const resetUser = async () => {
    const email = process.argv[2] || 'anthony.ha2120@gmail.com';

    console.log(`Preparing to wipe data for: ${email}`);

    try {
        if (!process.env.MONGO_URI) {
            throw new Error('MONGO_URI is not defined');
        }

        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        console.log(`Finding user with email: ${email}`);
        const user = await FamilyMember.findOne({ email: email.toLowerCase() });

        if (!user) {
            console.log('User not found.');
            await mongoose.disconnect();
            process.exit(0);
        }

        const {householdId} = (user as any);
        if (!householdId) {
            console.log('User has no household linked. Deleting user only...');
            await FamilyMember.findByIdAndDelete(user._id);
            console.log('User deleted.');
            await mongoose.disconnect();
            process.exit(0);
        }

        console.log(`Found Household ID: ${householdId}`);
        console.log('Deleting all associated data...');

        // Delete Database Items
        await Promise.all([
            FamilyMember.deleteMany({ householdId }),
            Household.findByIdAndDelete(householdId),
            Event.deleteMany({ householdId }),
            Task.deleteMany({ householdId }),
            Quest.deleteMany({ householdId }),
            Routine.deleteMany({ householdId }),
            MealPlan.deleteMany({ householdId }),
            WishlistItem.deleteMany({ householdId }),
            StoreItem.deleteMany({ householdId }),
            // Add other household-bound models here if needed
        ]);

        console.log('✅ Successfully wiped household and all associated data for:', email);

        await mongoose.disconnect();
        process.exit(0);

    } catch (error) {
        console.error('Reset User Failed:', error);
        process.exit(1);
    }
};

resetUser();
