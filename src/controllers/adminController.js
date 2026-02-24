const User = require('../models/User');
const Video = require('../models/Video');
const driveService = require('../services/driveService');
const bcrypt = require('bcryptjs');

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

        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'User removed' });
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

        const { title, description, rank, thumbnailUrl, generatedThumbnail } = req.body;
        const finalThumbnail = thumbnailUrl || generatedThumbnail || '';

        // Save metadata to DB since Google Drive direct stream upload succeeded
        const video = await Video.create({
            title,
            description,
            rank,
            driveFileId: req.file.driveFileId,
            thumbnailUrl: finalThumbnail
        });

        res.status(201).json(video);
    } catch (error) {
        console.error('Upload Initialization Error:', error);
        res.status(500).json({ message: 'Failed to complete video upload', error: error.message });
    }
};

// OAuth endpoints for admin to authorize backend text output
const getAuthUrl = (req, res) => {
    res.json({ url: driveService.getAuthUrl() });
};

const handleCallback = async (req, res) => {
    try {
        const tokens = await driveService.handleCallback(req.query.code);
        res.send(`Successfully authorized! Copy this refresh token into your .env file: <h2>${tokens.refresh_token}</h2>`);
    } catch (error) {
        res.status(500).send('Authorization failed');
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

        const updatedVideo = await video.save();
        res.json(updatedVideo);
    } catch (error) {
        res.status(500).json({ message: 'Error updating video' });
    }
};

// Delete Video
const deleteVideo = async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ message: 'Video not found' });

        // Delete from Drive
        try {
            await driveService.deleteVideoFromDrive(video.driveFileId);
        } catch (driveErr) {
            console.error('Could not delete from drive (maybe already deleted):', driveErr.message);
        }

        // Delete from DB
        await Video.findByIdAndDelete(req.params.id);
        res.json({ message: 'Video deleted successfully' });
    } catch (error) {
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
    deleteVideo
};
