// check-pin-data.ts
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import FamilyMember from './src/models/FamilyMember';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';

async function checkPinData() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected!\n');

        const users = await FamilyMember.find().select('+pin');

        console.log(`Found ${users.length} users:\n`);

        for (const user of users) {
            console.log('---');
            console.log('Email:', user.email);
            console.log('Name:', user.firstName, user.lastName);
            console.log('Has PIN:', !!user.pin);
            console.log('PIN Setup Completed:', user.pinSetupCompleted);
            console.log('PIN Length:', user.pin?.length || 0);
            console.log('Onboarding Completed:', user.onboardingCompleted);
            console.log('---\n');
        }

        await mongoose.connection.close();
        console.log('Connection closed.');
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkPinData();
