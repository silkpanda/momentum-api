// list-and-clean-households.ts
// List all households and their members, with option to remove specific members

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import Household from './src/models/Household';
import FamilyMember from './src/models/FamilyMember';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI?.replace('<dbname>', 'momentum') || '';

async function listAndCleanHouseholds() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        const households = await Household.find({}).populate('memberProfiles.familyMemberId');
        console.log(`📊 Found ${households.length} households\n`);

        for (const household of households) {
            console.log(`\n🏠 Household: ${household.householdName} (ID: ${household._id})`);
            console.log(`   Members (${household.memberProfiles.length}):`);

            for (const profile of household.memberProfiles) {
                const member = profile.familyMemberId as any;
                const firstName = member?.firstName || 'Unknown';
                console.log(`   - ${profile.displayName} (${firstName}) - ${profile.role}`);
                console.log(`     Profile ID: ${profile._id}`);
                console.log(`     Family Member ID: ${profile.familyMemberId}`);
                console.log(`     isLinkedChild: ${profile.isLinkedChild || false}`);
            }
        }

        // Ask if user wants to remove any members
        console.log('\n\n💡 To remove a member, note their Profile ID and Household ID');
        console.log('   Then run: npx tsx remove-member.ts <householdId> <profileId>');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected');
    }
}

listAndCleanHouseholds();
