// verify-linked-child.ts
// Verify if a child is properly linked with the flag set

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import Household from './src/models/Household';
import HouseholdLink from './src/models/HouseholdLink';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || '';

async function verifyLinkedChild() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to database:', mongoose.connection.db.databaseName, '\n');

        // Find all household links
        const links = await HouseholdLink.find({});
        console.log(`📊 Found ${links.length} household link(s)\n`);

        if (links.length === 0) {
            console.log('⚠️  No links found. Please link a child first.\n');
        }

        for (const link of links) {
            console.log(`\n🔗 Link for child ${link.childId}:`);

            const household1 = await Household.findById(link.household1);
            const household2 = await Household.findById(link.household2);

            if (household1) {
                const profile1 = household1.memberProfiles.find(
                    (p) => p.familyMemberId.toString() === link.childId.toString()
                );
                console.log(`\n   📍 Household 1: ${household1.householdName}`);
                if (profile1) {
                    console.log(`      ✅ Child found: ${profile1.displayName}`);
                    console.log(`      🏷️  isLinkedChild: ${profile1.isLinkedChild}`);
                    console.log(`      🆔 Profile ID: ${profile1._id}`);
                    console.log(`      🆔 Family Member ID: ${profile1.familyMemberId}`);
                } else {
                    console.log(`      ❌ Child NOT found in this household`);
                }
            }

            if (household2) {
                const profile2 = household2.memberProfiles.find(
                    (p) => p.familyMemberId.toString() === link.childId.toString()
                );
                console.log(`\n   📍 Household 2: ${household2.householdName}`);
                if (profile2) {
                    console.log(`      ✅ Child found: ${profile2.displayName}`);
                    console.log(`      🏷️  isLinkedChild: ${profile2.isLinkedChild}`);
                    console.log(`      🆔 Profile ID: ${profile2._id}`);
                    console.log(`      🆔 Family Member ID: ${profile2.familyMemberId}`);
                } else {
                    console.log(`      ❌ Child NOT found in this household`);
                }
            }
        }

        // Also check all households for any children with isLinkedChild flag
        console.log('\n\n📋 All children with isLinkedChild flag:');
        const allHouseholds = await Household.find({});
        let foundAny = false;

        for (const household of allHouseholds) {
            for (const profile of household.memberProfiles) {
                if (profile.isLinkedChild) {
                    foundAny = true;
                    console.log(`\n   🏠 ${household.householdName}`);
                    console.log(`      👤 ${profile.displayName}`);
                    console.log(`      🆔 Profile ID: ${profile._id}`);
                    console.log(`      🆔 Family Member ID: ${profile.familyMemberId}`);
                }
            }
        }

        if (!foundAny) {
            console.log('   ⚠️  No children with isLinkedChild flag found');
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected');
    }
}

verifyLinkedChild();
