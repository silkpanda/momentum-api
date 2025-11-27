// check-linked-children.ts
// Check for children marked as linked but without actual household links

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import Household from './src/models/Household';
import HouseholdLink from './src/models/HouseholdLink';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI?.replace('<dbname>', 'momentum') || '';

async function checkLinkedChildren() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        const households = await Household.find({});
        console.log(`📊 Checking ${households.length} households...\n`);

        let fixedCount = 0;

        for (const household of households) {
            for (const profile of household.memberProfiles) {
                if (profile.isLinkedChild) {
                    // Check if there's an actual link for this child
                    const link = await HouseholdLink.findOne({
                        childId: profile.familyMemberId,
                    });

                    if (!link) {
                        console.log(`🔧 Found orphaned flag in ${household.householdName}:`);
                        console.log(`   Child: ${profile.displayName}`);
                        console.log(`   isLinkedChild: true, but no HouseholdLink found`);
                        console.log(`   Fixing...`);

                        profile.isLinkedChild = false;
                        await household.save();
                        fixedCount++;
                        console.log(`   ✅ Fixed!\n`);
                    } else {
                        console.log(`✅ ${household.householdName} - ${profile.displayName}: Correctly linked`);
                    }
                }
            }
        }

        console.log(`\n✨ Check complete!`);
        console.log(`   - ${fixedCount} orphaned flags fixed`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected');
    }
}

checkLinkedChildren();
