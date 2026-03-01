const Video = require('../models/Video');
const WatchHistory = require('../models/WatchHistory');
const driveService = require('../services/driveService');

const getVideos = async (req, res) => {
    try {
        // Universally fetch all videos regardless of rank so they appear in Home/Explore teasers
        const videos = await Video.find({}).sort({ uploadDate: -1 });
        res.json(videos);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching videos' });
    }
};

const getVideoById = async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ message: 'Video not found' });

        let responseVideo = video.toObject();
        responseVideo.hashtags = (responseVideo.tags || []).map(t => `#${t}`);
        res.json(responseVideo);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching video' });
    }
}

const streamVideo = async (req, res) => {
    try {
        const video = req.video; // Extracted directly by checkRank middleware
        const { stream, headers, status } = await driveService.getVideoStream(video.driveFileId, req.headers.range);

        res.writeHead(status, headers);
        stream.pipe(res);
    } catch (error) {
        console.error('Stream error:', error);
        res.status(500).json({ message: 'Error streaming video' });
    }
};

const likeVideo = async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ message: 'Video not found' });

        const userId = req.user._id;

        // Check if already liked
        const isLiked = video.likes.includes(userId);

        if (isLiked) {
            // Toggle off
            video.likes.pull(userId);
        } else {
            // Toggle on, and remove from dislikes if present
            video.likes.push(userId);
            video.dislikes.pull(userId);
        }

        await video.save();
        res.json({ likes: video.likes.length, dislikes: video.dislikes.length, isLiked: !isLiked, isDisliked: false });
    } catch (error) {
        res.status(500).json({ message: 'Error liking video' });
    }
};

const dislikeVideo = async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ message: 'Video not found' });

        const userId = req.user._id;

        // Check if already disliked
        const isDisliked = video.dislikes.includes(userId);

        if (isDisliked) {
            // Toggle off
            video.dislikes.pull(userId);
        } else {
            // Toggle on, and remove from likes if present
            video.dislikes.push(userId);
            video.likes.pull(userId);
        }

        await video.save();
        res.json({ likes: video.likes.length, dislikes: video.dislikes.length, isLiked: false, isDisliked: !isDisliked });
    } catch (error) {
        res.status(500).json({ message: 'Error disliking video' });
    }
};

const addView = async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ message: 'Video not found' });

        video.views = (video.views || 0) + 1;
        await video.save();

        if (req.user) {
            const userId = req.user._id;
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);

            const existingHistory = await WatchHistory.findOne({
                userId,
                videoId: video._id,
                watchedAt: { $gte: startOfDay }
            });

            if (existingHistory) {
                existingHistory.watchedAt = Date.now();
                await existingHistory.save();
            } else {
                await WatchHistory.create({
                    userId,
                    videoId: video._id,
                    watchDuration: 0,
                    watchedAt: Date.now()
                });
            }
        }

        res.json({ views: video.views });
    } catch (error) {
        console.error('Error in addView:', error);
        res.status(500).json({ message: 'Error appending view' });
    }
};

module.exports = {
    getVideos,
    getVideoById,
    streamVideo,
    likeVideo,
    dislikeVideo,
    addView
};
