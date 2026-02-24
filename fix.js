require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Video = require('./src/models/Video');

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('Connected DB');
        const result = await Video.deleteMany({ title: /asdasd/i });
        console.log('Deleted orphaned "asdasd" videos:', result.deletedCount);

        // Also clean any stuck pending videos if they exist
        const pending = await Video.deleteMany({ driveFileId: 'pending' });
        console.log('Deleted stuck "pending" videos:', pending.deletedCount);

        process.exit(0);
    })
    .catch((err) => {
        console.error('Error:', err);
        process.exit(1);
    });
