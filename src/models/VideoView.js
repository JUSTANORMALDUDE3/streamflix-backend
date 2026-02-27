const mongoose = require('mongoose');

const videoViewSchema = new mongoose.Schema({
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    viewedAt: { type: Date, default: Date.now },
    watchTime: { type: Number, default: 0 }  // seconds watched
});

// Indexes for efficient aggregation
videoViewSchema.index({ videoId: 1 });
videoViewSchema.index({ viewedAt: 1 });
videoViewSchema.index({ userId: 1 });

module.exports = mongoose.model('VideoView', videoViewSchema);
