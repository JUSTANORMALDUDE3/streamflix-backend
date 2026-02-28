require('dotenv').config({ path: __dirname + '/../../.env' });
require('dotenv').config({ path: __dirname + '/../.env' });

const mongoose = require('mongoose');
const dns = require('dns');
const Video = require('../src/models/Video');
const https = require('https');
const http = require('http');

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

const checkUrlStatus = (url) => {
    return new Promise((resolve) => {
        if (!url || typeof url !== 'string' || !url.startsWith('http')) {
            resolve({ valid: false, reason: 'Invalid URL format' });
            return;
        }

        const client = url.startsWith('https') ? https : http;

        const req = client.request(url, { method: 'HEAD', timeout: 5000 }, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 400) {
                resolve({ valid: true });
            } else {
                resolve({ valid: false, reason: `HTTP Status ${res.statusCode}` });
            }
        });

        req.on('error', (err) => resolve({ valid: false, reason: err.message }));
        req.on('timeout', () => { req.destroy(); resolve({ valid: false, reason: 'Timeout' }); });
        req.end();
    });
};

const runVerification = async () => {
    await connectDB();
    console.log('--- Starting Drive Thumbnail Verification ---');

    try {
        const videos = await Video.find({ thumbnailUrl: { $exists: true, $ne: '' } }).select('_id thumbnailUrl');
        console.log(`Analyzing ${videos.length} videos with thumbnails...`);

        let validCount = 0;
        let failCount = 0;
        let failedVideos = [];

        for (let i = 0; i < videos.length; i++) {
            const v = videos[i];
            process.stdout.write(`\r[${i + 1}/${videos.length}] Checking ${v._id}...                   `);

            const result = await checkUrlStatus(v.thumbnailUrl);

            if (result.valid) {
                validCount++;
            } else {
                failCount++;
                failedVideos.push({ id: v._id, url: v.thumbnailUrl, reason: result.reason });
            }
        }

        console.log('\n\n--- Verification Complete ---');
        console.log(`Valid: ${validCount}`);
        console.log(`Failed: ${failCount}`);

        if (failCount > 0) {
            console.log('\nFailed Details:');
            failedVideos.forEach(fv => {
                console.log(`- ID: ${fv.id} | Reason: ${fv.reason}`);
                console.log(`  🔗 ${fv.url.substring(0, 80)}${fv.url.length > 80 ? '...' : ''}`);
            });
            console.log('\n❌ Action Required: Fix failed thumbnails before running cleanup.');
            process.exit(1);
        } else {
            console.log('\n✅ All thumbnails are valid and accessible!');
            console.log('You may now safely run the cleanup script.');
            process.exit(0);
        }

    } catch (err) {
        console.error('\nFatal error during verification:', err);
        process.exit(1);
    }
};

runVerification();
