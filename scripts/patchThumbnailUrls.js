require('dotenv').config({ path: __dirname + '/../../.env' });
require('dotenv').config({ path: __dirname + '/../.env' });

const mongoose = require('mongoose');
const dns = require('dns');
const Video = require('../src/models/Video');

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

const runPatch = async () => {
    await connectDB();
    console.log('--- Starting URL format patch ---');

    try {
        const videos = await Video.find({ thumbnailUrl: { $regex: 'drive.google.com/uc\\?id=' } });
        console.log(`Found ${videos.length} videos with deprecated uc?id= URL format...`);
        let count = 0;

        for (const video of videos) {
            const url = video.thumbnailUrl;
            const idMatch = url.match(/id=([a-zA-Z0-9_-]+)/);
            if (idMatch && idMatch[1]) {
                const newUrl = `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w1000`;
                video.thumbnailUrl = newUrl;
                await video.save();
                count++;
            }
        }
        console.log(`✔ Replaced urls for ${count} videos to use thumbnail format.`);
        console.log('--- Patch Complete ---');
        process.exit(0);

    } catch (err) {
        console.error('Fatal error during patch:', err);
        process.exit(1);
    }
};

runPatch();
