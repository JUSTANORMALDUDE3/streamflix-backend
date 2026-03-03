const Video = require('../models/Video');
const VideoView = require('../models/VideoView');
const WatchHistory = require('../models/WatchHistory');
const driveService = require('../services/driveService');
const { clearCachePrefix } = require('../middleware/cacheService');

const getVideos = async (req, res) => {
    try {
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

        const eventViews = await VideoView.countDocuments({ videoId: video._id });

        const responseVideo = video.toObject();
        responseVideo.views = (responseVideo.views || 0) + eventViews;
        responseVideo.hashtags = (responseVideo.tags || []).map(t => `#${t}`);
        res.json(responseVideo);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching video' });
    }
}

const streamVideo = async (req, res) => {
    try {
        const video = req.video;
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
        const isLiked = video.likes.includes(userId);

        if (isLiked) {
            video.likes.pull(userId);
        } else {
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
        const isDisliked = video.dislikes.includes(userId);

        if (isDisliked) {
            video.dislikes.pull(userId);
        } else {
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

        clearCachePrefix('/api/videos');
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
