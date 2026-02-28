require('dotenv').config({ path: __dirname + '/../../.env' });
require('dotenv').config({ path: __dirname + '/../.env' }); // try both roots

const mongoose = require('mongoose');
const dns = require('dns');
const Video = require('../src/models/Video');
const { uploadThumbnail } = require('../src/services/driveUploader');

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

const runMigration = async () => {
    await connectDB();

    console.log('--- Starting Thumbnail Migration ---');

    try {
        // Find all videos that have a thumbnailUrl starting with 'data:image' OR 
        // whatever field currently stores the base64. 
        // Looking at the prompt, the user said current DB field: thumbnailBase64
        // But the Video.js schema currently only has `thumbnailUrl`. 
        // We will look for videos where thumbnailUrl is a base64 string.
        const videosToMigrate = await Video.find({
            thumbnailUrl: { $regex: /^data:image/ }
        });

        console.log(`Found ${videosToMigrate.length} videos requiring migration.`);

        let successCount = 0;
        let skipCount = 0;
        let failCount = 0;

        for (let i = 0; i < videosToMigrate.length; i++) {
            const video = videosToMigrate[i];

            // Check if it's already a drive URL just in case
            if (video.thumbnailUrl && video.thumbnailUrl.includes('drive.google.com')) {
                skipCount++;
                continue;
            }

            console.log(`[${i + 1}/${videosToMigrate.length}] Migrating thumbnail for video: ${video._id}`);

            try {
                // Decode Base64 string safely
                // Format: data:image/jpeg;base64,/9j/4AAQSkZJRg...
                const matches = video.thumbnailUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

                if (!matches || matches.length !== 3) {
                    console.error(`  [!] Invalid base64 format for video: ${video._id}. Skipping.`);
                    failCount++;
                    continue;
                }

                // const mimeType = matches[1]; // Not strictly needed, we map to jpeg in uploader
                const base64Data = matches[2];
                const buffer = Buffer.from(base64Data, 'base64');
                const filename = `thumbnail_${video._id}.jpg`;

                // Upload using the drive service
                const driveUrl = await uploadThumbnail(buffer, filename);
                console.log(`  ✔ Uploaded to Drive: ${driveUrl}`);

                // Save to DB
                video.thumbnailUrl = driveUrl;

                // We add a dynamic flag so we know it was migrated by the script
                video.set('migrationCompleted', true, { strict: false });

                await video.save();
                console.log(`  ✔ Database updated`);
                successCount++;

            } catch (err) {
                console.error(`  [X] Failed to migrate video ${video._id}:`, err.message);
                failCount++;
            }
        }

        console.log('--- Migration Complete ---');
        console.log(`Total processed: ${videosToMigrate.length}`);
        console.log(`Skipped: ${skipCount}`);
        console.log(`Successfully Migrated: ${successCount}`);
        console.log(`Failed: ${failCount}`);

    } catch (err) {
        console.error('Fatal error during migration:', err);
    } finally {
        mongoose.connection.close();
        process.exit(0);
    }
};

runMigration();
