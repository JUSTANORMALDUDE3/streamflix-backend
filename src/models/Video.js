const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    rank: {
        type: String,
        enum: ['top', 'middle', 'free'],
        required: true
    },
    tags: {
        type: [String],
        default: []
    },
    driveFileId: {
        type: String
    },
    thumbnailUrl: {
        type: String
    },
    originalFilename: { type: String },
    fileSize: { type: Number },
    duration: { type: Number },
    // Scheduled publishing
    status: {
        type: String,
        enum: ['draft', 'scheduled', 'published'],
        default: 'published'
    },
    publishAt: {
        type: Date,
        default: null
    },
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    dislikes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    views: {
        type: Number,
        default: 0
    },
    uploadDate: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Indexes for scheduler and filtering
videoSchema.index({ status: 1, publishAt: 1 });
videoSchema.index({ title: 'text', tags: 'text' });

module.exports = mongoose.model('Video', videoSchema);
