// cleanup-real-data.ts
// Clean up the actual database

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import Household from './src/models/Household';
import HouseholdLink from './src/models/HouseholdLink';
import FamilyMember from './src/models/FamilyMember';

dotenv.config();

// Use the actual database name from .env (don't replace <dbname>)
const MONGO_URI = process.env.MONGO_URI || '';

async function cleanupRealData() {
    try {
        console.log('🔌 Connecting to MongoDB...\n');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to database:', mongoose.connection.db.databaseName, '\n');

        // Find all household links
        const links = await HouseholdLink.find({});
        console.log(`📊 Found ${links.length} household link(s)\n`);

        let cleaned = 0;
        let updated = 0;

        for (const link of links) {
            console.log(`\n🔍 Checking link for child ${link.childId}...`);

            const household1 = await Household.findById(link.household1);
            const household2 = await Household.findById(link.household2);

            if (!household1 || !household2) {
                console.log(`⚠️  One or both households not found - deleting link`);
                await HouseholdLink.findByIdAndDelete(link._id);
                cleaned++;
                continue;
            }

            console.log(`   Household 1: ${household1.householdName}`);
            console.log(`   Household 2: ${household2.householdName}`);

            // Check if child exists in both households
            const profile1 = household1.memberProfiles.find(
                (p) => p.familyMemberId.toString() === link.childId.toString()
            );
            const profile2 = household2.memberProfiles.find(
                (p) => p.familyMemberId.toString() === link.childId.toString()
            );

            console.log(`   In Household 1: ${profile1 ? `YES (${profile1.displayName})` : 'NO'}`);
            console.log(`   In Household 2: ${profile2 ? `YES (${profile2.displayName})` : 'NO'}`);

            // If child is missing from one or both households, clean up
            if (!profile1 || !profile2) {
                console.log(`\n   🧹 Cleaning up orphaned link...`);

                // Update the household that still has the child
                if (profile1 && profile1.isLinkedChild) {
                    profile1.isLinkedChild = false;
                    await household1.save();
                    console.log(`   ✅ Updated ${household1.householdName} - removed link flag`);
                    updated++;
                }

                if (profile2 && profile2.isLinkedChild) {
                    profile2.isLinkedChild = false;
                    await household2.save();
                    console.log(`   ✅ Updated ${household2.householdName} - removed link flag`);
                    updated++;
                }

                // Delete the link
                await HouseholdLink.findByIdAndDelete(link._id);
                console.log(`   ✅ Deleted orphaned link`);
                cleaned++;

                // Update child's linkedHouseholds array
                const child = await FamilyMember.findById(link.childId);
                if (child && child.linkedHouseholds) {
                    child.linkedHouseholds = child.linkedHouseholds.filter(
                        (lh: any) =>
                            lh.householdId.toString() !== link.household1.toString() &&
                            lh.householdId.toString() !== link.household2.toString()
                    );
                    await child.save();
                    console.log(`   ✅ Cleaned up child's linkedHouseholds array`);
                }
            } else {
                console.log(`   ✅ Link is valid - both households have the child`);
            }
        }

        console.log(`\n\n✨ Cleanup complete!`);
        console.log(`   - ${cleaned} orphaned links deleted`);
        console.log(`   - ${updated} household profiles updated`);

        if (cleaned === 0 && updated === 0) {
            console.log(`   - No issues found - all links are valid! 🎉`);
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected');
    }
}

cleanupRealData();
