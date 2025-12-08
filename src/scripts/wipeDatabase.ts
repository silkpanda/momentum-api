import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Models
import FamilyMember from '../models/FamilyMember';
import Household from '../models/Household';
import Task from '../models/Task';
import Quest from '../models/Quest';
import Event from '../models/Event';
import Routine from '../models/Routine';
import MealPlan from '../models/MealPlan';
import StoreItem from '../models/StoreItem';
import WishlistItem from '../models/WishlistItem';
import HouseholdLink from '../models/HouseholdLink';
import ChildLinkCode from '../models/ChildLinkCode';
import Notification from '../models/Notification';
import Recipe from '../models/Recipe';
import Restaurant from '../models/Restaurant';
import Transaction from '../models/Transaction';
import WeeklyMealPlan from '../models/WeeklyMealPlan';

// Determine if we're running from src (ts-node) or dist (node)
const isTsNode = process.execArgv.some(arg => arg.includes('ts-node')) || __filename.endsWith('.ts');
const envPath = path.resolve(__dirname, isTsNode ? '../../.env' : '../../.env');

dotenv.config({ path: envPath });

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI || '');
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const wipeData = async () => {
    try {
        await connectDB();

        console.log('🗑️  Wiping all data...');

        await FamilyMember.deleteMany({});
        console.log('✅ FamilyMembers deleted');

        await Household.deleteMany({});
        console.log('✅ Households deleted');

        await Task.deleteMany({});
        console.log('✅ Tasks deleted');

        await Quest.deleteMany({});
        console.log('✅ Quests deleted');

        await Event.deleteMany({});
        console.log('✅ Events deleted');

        await Routine.deleteMany({});
        console.log('✅ Routines deleted');

        await MealPlan.deleteMany({});
        console.log('✅ MealPlans deleted');

        await StoreItem.deleteMany({});
        console.log('✅ StoreItems deleted');

        await WishlistItem.deleteMany({});
        console.log('✅ WishlistItems deleted');

        await HouseholdLink.deleteMany({});
        console.log('✅ HouseholdLinks deleted');

        await ChildLinkCode.deleteMany({});
        console.log('✅ ChildLinkCodes deleted');

        await Notification.deleteMany({});
        console.log('✅ Notifications deleted');

        await Recipe.deleteMany({});
        console.log('✅ Recipes deleted');

        await Restaurant.deleteMany({});
        console.log('✅ Restaurants deleted');

        await Transaction.deleteMany({});
        console.log('✅ Transactions deleted');

        await WeeklyMealPlan.deleteMany({});
        console.log('✅ WeeklyMealPlans deleted');

        console.log('✨ Data destroyed successfully!');
        process.exit();
    } catch (error) {
        console.error('❌ Error deleting data:', error);
        process.exit(1);
    }
};

// Check if run directly
if (require.main === module) {
    wipeData();
} else {
    console.error('This script must be run directly.');
    process.exit(1);
}
