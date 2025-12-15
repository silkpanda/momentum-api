// debug-pin.ts
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import FamilyMember from './src/models/FamilyMember';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';

async function main() {
    await mongoose.connect(MONGODB_URI);
    const id = process.argv[2];
    if (!id) {
        console.error('Provide member ID');
        process.exit(1);
    }
    const user = await FamilyMember.findById(id).select('+pin');
    console.log('User:', { _id: user?._id, pinHash: user?.pin, pinSetupCompleted: user?.pinSetupCompleted });
    process.exit(0);
}

main();
