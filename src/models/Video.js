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
    driveFileId: {
        type: String,
        required: true
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
