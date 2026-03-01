const mongoose = require('mongoose');

const watchHistorySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    videoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Video',
        required: true
    },
    watchedAt: {
        type: Date,
        default: Date.now
    },
    watchDuration: {
        type: Number,
        default: 0
    }
});

watchHistorySchema.index({ userId: 1, watchedAt: -1 });

// Automatically delete Watch History documents after 30 days (2592000 seconds)
watchHistorySchema.index({ watchedAt: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('WatchHistory', watchHistorySchema);
