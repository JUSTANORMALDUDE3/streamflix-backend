const express = require('express');
const router = express.Router();
const DownloadToken = require('../models/DownloadToken');
const Video = require('../models/Video');
const { protect, authorizeRoles } = require('../middleware/auth');

// Custom Token Generator
const generateSecureToken = () => {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const specials = '@#*!&';

    // Ensure at least one of each required type
    let tokenChars = [
        uppercase[Math.floor(Math.random() * uppercase.length)],
        lowercase[Math.floor(Math.random() * lowercase.length)],
        numbers[Math.floor(Math.random() * numbers.length)],
        specials[Math.floor(Math.random() * specials.length)]
    ];

    const allChars = uppercase + lowercase + numbers + specials;

    // Fill the rest to reach 16 characters
    for (let i = tokenChars.length; i < 16; i++) {
        tokenChars.push(allChars[Math.floor(Math.random() * allChars.length)]);
    }

    // Fisher-Yates shuffle the characters to randomize positions
    for (let i = tokenChars.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tokenChars[i], tokenChars[j]] = [tokenChars[j], tokenChars[i]];
    }

    return tokenChars.join('');
};

// @route   POST /api/admin/tokens
// @desc    Generate a new download token for a video
// @access  Private/Admin
router.post('/', protect, authorizeRoles('admin'), async (req, res) => {
    try {
        const { videoId, remainingUses } = req.body;

        if (!videoId || !remainingUses || remainingUses < 1) {
            return res.status(400).json({ message: 'Valid videoId and remainingUses (>= 1) are required.' });
        }

        // Verify video exists
        const video = await Video.findById(videoId);
        if (!video) {
            return res.status(404).json({ message: 'Video not found.' });
        }

        const tokenString = generateSecureToken();

        const newToken = new DownloadToken({
            token: tokenString,
            videoId,
            remainingUses
        });

        await newToken.save();
        res.status(201).json(newToken);
    } catch (err) {
        console.error('Error generating token:', err);
        res.status(500).json({ message: 'Server error generating token.' });
    }
});

// @route   GET /api/admin/tokens
// @desc    Get all active tokens globally
// @access  Private/Admin
router.get('/', protect, authorizeRoles('admin'), async (req, res) => {
    try {
        const tokens = await DownloadToken.find({})
            .populate('videoId', 'title')
            .sort({ createdAt: -1 });
        res.json(tokens);
    } catch (err) {
        console.error('Error fetching all tokens:', err);
        res.status(500).json({ message: 'Server error fetching all tokens.' });
    }
});

// @route   GET /api/admin/tokens/:videoId
// @desc    Get all tokens for a specific video
// @access  Private/Admin
router.get('/:videoId', protect, authorizeRoles('admin'), async (req, res) => {
    try {
        const tokens = await DownloadToken.find({ videoId: req.params.videoId }).sort({ createdAt: -1 });
        res.json(tokens);
    } catch (err) {
        console.error('Error fetching tokens:', err);
        res.status(500).json({ message: 'Server error fetching tokens.' });
    }
});

// @route   DELETE /api/admin/tokens/:id
// @desc    Delete a specific token
// @access  Private/Admin
router.delete('/:id', protect, authorizeRoles('admin'), async (req, res) => {
    try {
        const deletedToken = await DownloadToken.findByIdAndDelete(req.params.id);
        if (!deletedToken) {
            return res.status(404).json({ message: 'Token not found.' });
        }
        res.json({ message: 'Token deleted successfully.' });
    } catch (err) {
        console.error('Error deleting token:', err);
        res.status(500).json({ message: 'Server error deleting token.' });
    }
});

module.exports = router;
