require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Video = require('../src/models/Video');
const driveService = require('../src/services/driveService');

const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to DB successfully.\n');

        const videos = await Video.find({ driveFileId: { $exists: true, $ne: null } });
        console.log(`Found ${videos.length} videos attached to Google Drive.\n`);

        let successCount = 0;
        let failCount = 0;
        let skippedCount = 0;

        const driveClient = driveService.getDriveClient();

        for (const video of videos) {
            try {
                // If it already uses a valid Drive view link (not a thumbnailLink proxy), you can choose to skip it.
                // However, this script is aggressive and will force regenerate all to ensure they are high quality Drive Thumbnails.
                console.log(`Processing Video [${video._id}] - ${video.title}`);

                const response = await driveClient.files.get({
                    fileId: video.driveFileId,
                    fields: 'thumbnailLink'
                });

                if (response.data && response.data.thumbnailLink) {
                    // Drive returns a thumbnailLink like: https://lh3.googleusercontent.com/u/0/d/ID=w200-h150-p
                    // Strip the size parameters so we can use a higher resolution dynamically (e.g. =w1000)
                    const baseThumbnailUrl = response.data.thumbnailLink.split('=')[0];
                    const highResThumbnail = `${baseThumbnailUrl}=w1000`;

                    video.thumbnailUrl = highResThumbnail;
                    await video.save();
                    console.log(`  ✅ Successfully updated thumbnail: ${highResThumbnail}`);
                    successCount++;
                } else {
                    console.log(`  ⚠️ No thumbnailLink available from Drive for fileId: ${video.driveFileId}`);
                    failCount++;
                }

                // Rate limiting protection
                await new Promise(resolve => setTimeout(resolve, 300));

            } catch (err) {
                console.error(`  ❌ Failed to process video ${video._id}:`, err.message);
                failCount++;
            }
        }

        console.log('\n================================');
        console.log('Bulk Regeneration Complete');
        console.log(`Successfully updated: ${successCount}`);
        console.log(`Failed: ${failCount}`);
        console.log(`Skipped: ${skippedCount}`);
        console.log('================================\n');

        process.exit(0);
    } catch (error) {
        console.error('Fatal Error during execution:', error);
        process.exit(1);
    }
}

run();
