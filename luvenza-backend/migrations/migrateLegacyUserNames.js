const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const applyChanges = process.argv.includes('--apply');
const backupVerified = process.argv.includes('--backup-verified');

const legacyNameFilter = {
    username: { $type: 'string', $regex: /\S/ },
    $or: [
        { name: { $exists: false } },
        { name: null },
        { name: { $regex: /^\s*$/ } }
    ]
};

async function run() {
    if (applyChanges && !backupVerified) {
        throw new Error('Refusing to migrate without the --backup-verified flag.');
    }

    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not configured.');
    }

    await mongoose.connect(process.env.MONGODB_URI);

    try {
        const users = mongoose.connection.collection('users');
        const legacyUsers = await users.find(legacyNameFilter, {
            projection: { _id: 1, username: 1 }
        }).toArray();

        const safeUpdates = legacyUsers
            .map(user => ({
                id: user._id,
                name: user.username.trim(),
                sourceUsername: user.username
            }))
            .filter(user => user.name.length > 0 && user.name.length <= 100);

        const skippedCount = legacyUsers.length - safeUpdates.length;
        console.log(`Legacy users needing a name backfill: ${legacyUsers.length}`);
        console.log(`Safe to backfill (non-empty, at most 100 chars): ${safeUpdates.length}`);
        console.log(`Skipped for manual review: ${skippedCount}`);

        if (!applyChanges) {
            console.log('Dry run only. No documents were changed.');
            return;
        }

        if (safeUpdates.length === 0) {
            console.log('No eligible documents to update.');
            return;
        }

        const result = await users.bulkWrite(safeUpdates.map(user => ({
            updateOne: {
                filter: {
                    _id: user.id,
                    $or: [
                        { name: { $exists: false } },
                        { name: null },
                        { name: { $regex: /^\s*$/ } }
                    ],
                    username: user.sourceUsername
                },
                update: { $set: { name: user.name } }
            }
        })), { ordered: false });

        console.log(`Backfilled User.name on ${result.modifiedCount} documents.`);
        console.log('Legacy username values were retained.');
    } finally {
        await mongoose.disconnect();
    }
}

run().catch(error => {
    console.error(`Legacy User name migration failed: ${error.message}`);
    process.exitCode = 1;
});
