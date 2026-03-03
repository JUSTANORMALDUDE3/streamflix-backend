const User = require('../models/User');
const Video = require('../models/Video');
const WatchHistory = require('../models/WatchHistory');
const driveService = require('../services/driveService');
const bcrypt = require('bcryptjs');
const { normalizeTags } = require('../utils/normalizeTags');
const { uploadThumbnail } = require('../services/driveUploader');
const { clearCachePrefix } = require('../middleware/cacheService');

// Add User
const addUser = async (req, res) => {
    const { username, password, rank, role } = req.body;
    try {
        const userExists = await User.findOne({ username });
        if (userExists) return res.status(400).json({ message: 'User already exists' });

        let userRole = role || 'user';
        let userRank = rank || 'free';

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            username,
            password: hashedPassword,
            rank: userRank,
            role: userRole
        });

        res.status(201).json({ _id: user._id, username: user.username, rank: user.rank, role: user.role });
    } catch (error) {
        res.status(500).json({ message: 'Error adding user', error: error.message });
    }
};

// Delete User
const deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.username === 'admin') return res.status(403).json({ message: 'Cannot delete default admin' });

        // Cascade delete all history logic matching the user ID 
        await WatchHistory.deleteMany({ userId: user._id });
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'User and their watch history removed' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting user' });
    }
};

// Upload Video metadata
// Expects multipart/form-data
// req.file is the video uploaded via multer
const uploadVideo = async (req, res) => {
    try {
        if (!req.file || !req.file.driveFileId) {
            return res.status(400).json({ message: 'No video file provided or upload failed' });
        }

        const { title, description, rank, thumbnailUrl, generatedThumbnail, tags, originalFilename, fileSize, duration, targetAccount } = req.body;
        let finalThumbnail = thumbnailUrl || generatedThumbnail || '';

        // If the thumbnail is a Base64 string, convert and upload to Drive immediately
        if (finalThumbnail.startsWith('data:image')) {
            const matches = finalThumbnail.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const buffer = Buffer.from(matches[2], 'base64');
                const filename = `thumbnail_${req.file.driveFileId}.jpg`;
                finalThumbnail = await uploadThumbnail(buffer, filename, targetAccount);
            }
        }

        // Parse tags from comma-separated string to array
        const tagsArray = normalizeTags(tags);

        // Save metadata to DB since Google Drive direct stream upload succeeded
        const video = await Video.create({
            title,
            description,
            rank,
            tags: tagsArray,
            driveFileId: req.file.driveFileId,
            thumbnailUrl: finalThumbnail,
            originalFilename,
            fileSize,
            duration
        });

        // Invalidate video cache
        clearCachePrefix('/api/videos');

        res.status(201).json(video);
    } catch (error) {
        console.error('Upload Initialization Error:', error);
        res.status(500).json({ message: 'Failed to complete video upload', error: error.message });
    }
};

// OAuth endpoints for admin to authorize backend text output
const getAuthUrl = (req, res) => {
    const accountType = req.query.accountType || 'primary';
    res.redirect(driveService.getAuthUrl(accountType));
};

const handleCallback = async (req, res) => {
    try {
        const accountType = req.query.state || 'primary';
        const tokens = await driveService.handleCallback(req.query.code, accountType);
        res.send(`Successfully authorized! Copy this refresh token into your .env file for the <b>${accountType.toUpperCase()}</b> account: <h2>${tokens.refresh_token}</h2>`);
    } catch (error) {
        console.error('OAuth Callback Error:', error.message || error);
        res.status(500).send(`Authorization failed: ${error.message || 'Unknown error. Check console.'}`);
    }
};

// Get all users
const getUsers = async (req, res) => {
    try {
        const users = await User.find({}).select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users' });
    }
};

// Get all videos for admin management
const getAllVideos = async (req, res) => {
    try {
        const videos = await Video.find({}).sort({ uploadDate: -1 });
        res.json(videos);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching videos' });
    }
};

// Update Video (Title & Rank only)
const updateVideo = async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ message: 'Video not found' });

        if (req.body.title) video.title = req.body.title;
        if (req.body.rank) video.rank = req.body.rank;
        if (req.body.tags !== undefined) {
            video.tags = normalizeTags(req.body.tags);
        }

        const updatedVideo = await video.save();

        // Invalidate video cache
        clearCachePrefix('/api/videos');

        res.json(updatedVideo);
    } catch (error) {
        res.status(500).json({ message: 'Error updating video' });
    }
};

// Check for duplicates
const checkDuplicateVideo = async (req, res) => {
    try {
        const { title, originalFilename, fileSize } = req.query;
        let query = { $or: [] };

        if (title) query.$or.push({ title: { $regex: new RegExp(`^${title}$`, 'i') } });
        if (originalFilename) query.$or.push({ originalFilename });
        if (fileSize) query.$or.push({ fileSize: Number(fileSize) });

        if (query.$or.length === 0) return res.status(200).json({ duplicate: false });

        const video = await Video.findOne(query);

        if (video) {
            let reason = [];
            if (title && video.title.toLowerCase() === title.toLowerCase()) reason.push('Title');
            if (originalFilename && video.originalFilename === originalFilename) reason.push('Filename');
            if (fileSize && video.fileSize === Number(fileSize)) reason.push('File Size');

            res.json({ duplicate: true, reason: reason.join(' and '), existingVideo: { title: video.title, _id: video._id } });
        } else {
            res.json({ duplicate: false });
        }
    } catch (error) {
        console.error('checkDuplicateVideo error:', error);
        res.status(500).json({ message: 'Error checking duplicates' });
    }
};

// Delete Video
const deleteVideo = async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ message: 'Video not found' });

        // Delete from Drive (best-effort — always clean up DB regardless)
        let driveDeleteWarning = null;
        try {
            await driveService.deleteVideoFromDrive(video.driveFileId);
        } catch (driveErr) {
            console.error('[Delete] Could not delete video from Drive:', driveErr.message);
            driveDeleteWarning = driveErr.message;
        }

        try {
            if (video.thumbnailUrl) {
                await driveService.deleteThumbnailFromDrive(video.thumbnailUrl);
            }
        } catch (thumbErr) {
            console.error('[Delete] Could not delete thumbnail from Drive:', thumbErr.message);
        }

        // Always delete from DB so the video disappears from frontend
        await Video.findByIdAndDelete(req.params.id);

        // Invalidate video cache
        clearCachePrefix('/api/videos');

        if (driveDeleteWarning) {
            res.json({ message: `Video removed from database. Warning: could not delete from Drive (${driveDeleteWarning}). You may need to delete the file manually from Google Drive.` });
        } else {
            res.json({ message: 'Video and thumbnail deleted successfully from both database and Drive.' });
        }
    } catch (error) {
        console.error('Database deletion error:', error);
        res.status(500).json({ message: 'Error deleting video' });
    }
};

module.exports = {
    addUser,
    deleteUser,
    uploadVideo,
    getAuthUrl,
    handleCallback,
    getUsers,
    getAllVideos,
    updateVideo,
    deleteVideo,
    checkDuplicateVideo
};
