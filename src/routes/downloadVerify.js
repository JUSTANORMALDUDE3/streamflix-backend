const express = require('express');
const router = express.Router();
const DownloadToken = require('../models/DownloadToken');
const Video = require('../models/Video');
const driveService = require('../services/driveService');

// @route   POST /api/download/verify
// @desc    Verify download token and return Google Drive download URL
// @access  Public
router.post('/verify', async (req, res) => {
    try {
        const { token, videoId } = req.body;

        if (!token || !videoId) {
            return res.status(400).json({ message: 'Token and Video ID are required.' });
        }

        // Find token and populate video to get driveFileId
        const tokenRecord = await DownloadToken.findOne({ token, videoId });

        if (!tokenRecord) {
            return res.status(404).json({ message: 'Invalid or expired token for this video.' });
        }

        if (tokenRecord.remainingUses <= 0) {
            // Failsafe cleanup
            await DownloadToken.findByIdAndDelete(tokenRecord._id);
            return res.status(400).json({ message: 'Token has no remaining uses.' });
        }

        // Find the associated video to get the file ID
        const video = await Video.findById(videoId);
        if (!video || !video.driveFileId) {
            return res.status(404).json({ message: 'Video source file not found.' });
        }

        // Construct our backend proxy download URL (relative path from API base)
        const downloadUrl = `/download/file/${video._id}?token=${encodeURIComponent(token)}`;

        // Return URL to frontend
        res.json({ downloadUrl });

    } catch (err) {
        console.error('Error verifying token:', err);
        res.status(500).json({ message: 'Server error verifying token.' });
    }
});

// @route   GET /api/download/file/:videoId
// @desc    Actually stream the file and decrement token
// @access  Public
router.get('/file/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;
        const { token } = req.query;

        if (!token || !videoId) {
            return res.status(400).send('Token and Video ID are required.');
        }

        const tokenRecord = await DownloadToken.findOne({ token, videoId });

        if (!tokenRecord || tokenRecord.remainingUses <= 0) {
            return res.status(404).send('Invalid, expired, or depleted token.');
        }

        const video = await Video.findById(videoId);
        if (!video || !video.driveFileId) {
            return res.status(404).send('Video source file not found.');
        }

        // Decrement token usage
        tokenRecord.remainingUses -= 1;

        if (tokenRecord.remainingUses <= 0) {
            // Auto-delete if usage reaches 0
            await DownloadToken.findByIdAndDelete(tokenRecord._id);
        } else {
            // Save decremented count
            await tokenRecord.save();
        }

        // Set headers to force download
        res.setHeader('Content-Disposition', `attachment; filename="${video.title.replace(/[^a-zA-Z0-9.-]/g, '_')}.mp4"`);
        res.setHeader('Content-Type', 'video/mp4');

        // Pipe the stream from Google Drive to the client
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
