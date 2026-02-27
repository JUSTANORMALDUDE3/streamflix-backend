const mongoose = require('mongoose');

const usageLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    ip: { type: String, default: '' },
    usedAt: { type: Date, default: Date.now },
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video' }
}, { _id: false });

const downloadTokenSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true,
        unique: true
    },
    videoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Video',
        required: true
    },
    // Legacy field kept for backward compat — mirrors (maxUses - usedCount)
    remainingUses: {
        type: Number,
        required: true,
        min: 0
    },
    maxUses: {
        type: Number,
        required: true,
        min: 1
    },
    usedCount: {
        type: Number,
        default: 0
    },
    usageLogs: {
        type: [usageLogSchema],
        default: []
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('DownloadToken', downloadTokenSchema);
