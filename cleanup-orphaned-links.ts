// cleanup-orphaned-links.ts
// Run this script to clean up household links where the child no longer exists in one of the households

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import Household from './src/models/Household';
import HouseholdLink from './src/models/HouseholdLink';
import FamilyMember from './src/models/FamilyMember';

// Load environment variables
dotenv.config();

const MONGO_URI = process.env.MONGO_URI?.replace('<dbname>', 'momentum') || '';

if (!MONGO_URI || MONGO_URI.includes('<dbname>')) {
    console.error('❌ Error: MONGO_URI not properly configured in .env file');
    console.error('   Please update MONGO_URI in .env and replace <dbname> with your database name');
    process.exit(1);
}

async function cleanupOrphanedLinks() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Find all household links
        const links = await HouseholdLink.find({});
        console.log(`\n📊 Found ${links.length} household links to check`);

        let cleaned = 0;
        let updated = 0;

        for (const link of links) {
            const household1 = await Household.findById(link.household1);
            const household2 = await Household.findById(link.household2);

            if (!household1 || !household2) {
                console.log(`⚠️  Skipping link ${link._id} - one or both households not found`);
                continue;
            }

            // Check if child exists in both households
            const inHousehold1 = household1.memberProfiles.some(
                (p) => p.familyMemberId.toString() === link.childId.toString()
            );
            const inHousehold2 = household2.memberProfiles.some(
                (p) => p.familyMemberId.toString() === link.childId.toString()
            );

            // If child is missing from one or both households, clean up
            if (!inHousehold1 || !inHousehold2) {
                console.log(`\n🧹 Cleaning up orphaned link for child ${link.childId}`);
                console.log(`   - In Household 1 (${household1.householdName}): ${inHousehold1 ? 'YES' : 'NO'}`);
                console.log(`   - In Household 2 (${household2.householdName}): ${inHousehold2 ? 'YES' : 'NO'}`);

                // Update the household that still has the child
                if (inHousehold1) {
                    const profile = household1.memberProfiles.find(
                        (p) => p.familyMemberId.toString() === link.childId.toString()
                    );
                    if (profile && profile.isLinkedChild) {
                        profile.isLinkedChild = false;
                        await household1.save();
                        console.log(`   ✅ Updated ${household1.householdName} - set isLinkedChild to false`);
                        updated++;
                    }
                }

                if (inHousehold2) {
                    const profile = household2.memberProfiles.find(
                        (p) => p.familyMemberId.toString() === link.childId.toString()
                    );
                    if (profile && profile.isLinkedChild) {
                        profile.isLinkedChild = false;
                        await household2.save();
                        console.log(`   ✅ Updated ${household2.householdName} - set isLinkedChild to false`);
                        updated++;
                    }
                }

                // Delete the link
                await HouseholdLink.findByIdAndDelete(link._id);
                console.log(`   ✅ Deleted orphaned link`);
                cleaned++;

                // Update child's linkedHouseholds array
                const child = await FamilyMember.findById(link.childId);
                if (child && child.linkedHouseholds) {
                    const originalLength = child.linkedHouseholds.length;
                    child.linkedHouseholds = child.linkedHouseholds.filter(
                        (lh: any) =>
                            lh.householdId.toString() !== link.household1.toString() &&
                            lh.householdId.toString() !== link.household2.toString()
                    );

                    if (child.linkedHouseholds.length < originalLength) {
                        await child.save();
                        console.log(`   ✅ Cleaned up child's linkedHouseholds array`);
                    }
                }
            }
        }

        console.log(`\n✨ Cleanup complete!`);
        console.log(`   - ${cleaned} orphaned links deleted`);
        console.log(`   - ${updated} household profiles updated`);

        if (cleaned === 0 && updated === 0) {
            console.log(`   - No orphaned links found - database is clean! 🎉`);
        }

    } catch (error) {
        console.error('❌ Error during cleanup:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');
    }
}

cleanupOrphanedLinks();
