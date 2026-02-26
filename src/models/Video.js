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
    // upload | embed — defaults to upload for backwards compatibility
    type: {
        type: String,
        enum: ['upload', 'embed'],
        default: 'upload'
    },
    // Only set for type === 'upload'
    driveFileId: {
        type: String
    },
    // Only set for type === 'embed'
    embed: {
        src: { type: String },
        width: { type: Number, default: 640 },
        height: { type: Number, default: 360 }
    },
    thumbnailUrl: {
        type: String
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

module.exports = mongoose.model('Video', videoSchema);
