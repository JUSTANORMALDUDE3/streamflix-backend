const express = require('express');
const router = express.Router();
const DownloadToken = require('../models/DownloadToken');
const Video = require('../models/Video');
const driveService = require('../services/driveService');

// @route   POST /api/download/verify
// @desc    Verify download token and return backend proxy download URL
// @access  Public
router.post('/verify', async (req, res) => {
    try {
        const { token, videoId } = req.body;
        if (!token || !videoId) return res.status(400).json({ message: 'Token and Video ID are required.' });

        const tokenRecord = await DownloadToken.findOne({ token, videoId });
        if (!tokenRecord) return res.status(404).json({ message: 'Invalid or expired token for this video.' });
        if (tokenRecord.remainingUses <= 0) {
            await DownloadToken.findByIdAndDelete(tokenRecord._id);
            return res.status(400).json({ message: 'Token has no remaining uses.' });
        }

        const video = await Video.findById(videoId);
        if (!video || !video.driveFileId) return res.status(404).json({ message: 'Video source file not found.' });

        const downloadUrl = `/download/file/${video._id}?token=${encodeURIComponent(token)}`;
        res.json({ downloadUrl });
    } catch (err) {
        console.error('Error verifying token:', err);
        res.status(500).json({ message: 'Server error verifying token.' });
    }
});

// @route   GET /api/download/file/:videoId
// @desc    Proxy stream the file, decrement token, log usage
// @access  Public
router.get('/file/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;
        const { token } = req.query;
        if (!token || !videoId) return res.status(400).send('Token and Video ID are required.');

        const tokenRecord = await DownloadToken.findOne({ token, videoId });
        if (!tokenRecord || tokenRecord.remainingUses <= 0) {
            return res.status(404).send('Invalid, expired, or depleted token.');
        }

        const video = await Video.findById(videoId);
        if (!video || !video.driveFileId) return res.status(404).send('Video source file not found.');

        // Log this usage
        const usageEntry = {
            userId: null,
            ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
            usedAt: new Date(),
            videoId: video._id
        };
        tokenRecord.usedCount = (tokenRecord.usedCount || 0) + 1;
        tokenRecord.remainingUses -= 1;
        tokenRecord.usageLogs = [...(tokenRecord.usageLogs || []), usageEntry];

        if (tokenRecord.remainingUses <= 0) {
            await DownloadToken.findByIdAndDelete(tokenRecord._id);
        } else {
            await tokenRecord.save();
        }

        res.setHeader('Content-Disposition', `attachment; filename="${video.title.replace(/[^a-zA-Z0-9.-]/g, '_')}.mp4"`);
        res.setHeader('Content-Type', 'video/mp4');

        const fileStream = await driveService.getDownloadStream(video.driveFileId);
        fileStream.on('error', (err) => {
            console.error('Error streaming file to client:', err);
            if (!res.headersSent) res.status(500).send('Error downloading file.');
        });
        fileStream.pipe(res);
    } catch (err) {
        console.error('Error in proxy download:', err);
        if (!res.headersSent) res.status(500).send('Server error initiating download.');
    }
});

module.exports = router;
