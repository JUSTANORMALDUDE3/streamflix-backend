require('dotenv').config({ path: __dirname + '/../../.env' });
require('dotenv').config({ path: __dirname + '/../.env' });

const mongoose = require('mongoose');
const dns = require('dns');
const Video = require('../src/models/Video');
const fs = require('fs');
const path = require('path');

const connectDB = async () => {
    try {
        dns.setServers(['8.8.8.8', '8.8.4.4']);
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected.');
    } catch (err) {
        console.error('MongoDB Connection Error:', err);
        process.exit(1);
    }
};

const runCleanup = async () => {
    await connectDB();
    console.log('--- Starting Old Thumbnail Cleanup ---');

    try {
        // 1. Remove base64/migration flag from MongoDB
        console.log('\n1️⃣ Removing legacy database fields...');
        const dbResult = await Video.updateMany(
            {},
            { $unset: { thumbnailBase64: "", migrationCompleted: "" } },
            { strict: false }
        );
        console.log(`✔ Removed legacy fields from ${dbResult.modifiedCount} documents.`);

        // 2. Remove old local thumbnail files
        console.log('\n2️⃣ Scanning for local legacy thumbnail folders...');

        const possibleFolders = [
            path.join(__dirname, '../thumbnails_old'),
            path.join(__dirname, '../thumbnails'),
            path.join(__dirname, '../public/thumbnails')
        ];

        let filesDeleted = 0;

        for (const folder of possibleFolders) {
            if (fs.existsSync(folder)) {
                try {
                    const files = fs.readdirSync(folder);
                    console.log(`Found folder: ${folder} with ${files.length} files.`);

                    // Safely delete folder and contents
                    fs.rmSync(folder, { recursive: true, force: true });
                    filesDeleted += files.length;
                    console.log(`✔ Deleted folder and its contents safely.`);
                } catch (folderErr) {
                    console.error(`[!] Failed to delete folder ${folder}:`, folderErr.message);
                }
            }
        }

        if (filesDeleted === 0) {
            console.log('✔ No local thumbnail files found to delete.');
        } else {
            console.log(`✔ Deleted a total of ${filesDeleted} local thumbnail files.`);
        }

        console.log('\n--- Cleanup Complete ✅ ---');
        console.log('Your database is now fully migrated to Google Drive base URLs.');
        process.exit(0);

    } catch (err) {
        console.error('Fatal error during cleanup:', err);
        process.exit(1);
    }
};

runCleanup();
