const express = require('express');
const router = express.Router();
const { protect, authorizeRoles } = require('../middleware/auth');
const VideoView = require('../models/VideoView');
const Video = require('../models/Video');
const { clearCachePrefix } = require('../middleware/cacheService');

// POST /api/analytics/view
// Records a view event. Protected to avoid abuse.
// Body: { videoId, watchTime }
router.post('/view', protect, async (req, res) => {
    try {
        const { videoId, watchTime = 0 } = req.body;
        if (!videoId) return res.status(400).json({ message: 'videoId is required.' });

        const video = await Video.findById(videoId).select('views');
        if (!video) return res.status(404).json({ message: 'Video not found.' });

        await VideoView.create({
            videoId,
            userId: req.user?._id || null,
            watchTime: Math.max(0, Number(watchTime) || 0),
            viewedAt: new Date()
        });

        const eventViews = await VideoView.countDocuments({ videoId });
        const combinedViews = (video.views || 0) + eventViews;

        clearCachePrefix('/api/videos');
        res.json({ success: true, views: combinedViews });
    } catch (err) {
        console.error('Analytics view error:', err.message);
        res.json({ success: false });
    }
});

// GET /api/admin/analytics/overview
// Returns: daily views (30d), top 10 videos, active users, total watch time
router.get('/overview', protect, authorizeRoles('admin'), async (req, res) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const dailyViews = await VideoView.aggregate([
            { $match: { viewedAt: { $gte: thirtyDaysAgo } } },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$viewedAt' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const topVideos = await Video.aggregate([
            {
                $lookup: {
                    from: 'videoviews',
                    localField: '_id',
                    foreignField: 'videoId',
                    as: 'viewEvents'
                }
            },
            {
                $addFields: {
                    newViewsCount: { $size: '$viewEvents' },
                    newWatchTime: { $sum: '$viewEvents.watchTime' },
                    legacyViews: { $ifNull: ['$views', 0] }
                }
            },
            {
                $addFields: {
                    combinedViews: { $add: ['$legacyViews', '$newViewsCount'] }
                }
            },
            { $sort: { combinedViews: -1 } },
            { $limit: 10 },
            {
                $project: {
                    videoId: '$_id',
                    views: '$combinedViews',
                    totalWatchTime: '$newWatchTime',
                    title: 1,
                    thumbnailUrl: 1,
                    rank: 1
                }
            }
        ]);

        const activeUsersResult = await VideoView.aggregate([
            { $match: { viewedAt: { $gte: thirtyDaysAgo }, userId: { $ne: null } } },
            { $group: { _id: '$userId' } },
            { $count: 'count' }
        ]);
        const activeUsers = activeUsersResult[0]?.count || 0;

        const watchTimeResult = await VideoView.aggregate([
            { $match: { viewedAt: { $gte: thirtyDaysAgo } } },
            { $group: { _id: null, totalSeconds: { $sum: '$watchTime' } } }
        ]);
        const totalWatchTime = watchTimeResult[0]?.totalSeconds || 0;

        const legacyViewsResult = await Video.aggregate([
            { $group: { _id: null, total: { $sum: '$views' } } }
        ]);
        const legacyTotal = legacyViewsResult[0]?.total || 0;
        const newTotal = await VideoView.countDocuments();
        const totalViews = legacyTotal + newTotal;

        res.json({
            period: '30d',
            totalViews,
            activeUsers,
            totalWatchTime,
            dailyViews,
            topVideos
        });
    } catch (err) {
        console.error('Analytics overview error:', err);
        res.status(500).json({ message: 'Failed to fetch analytics.', error: err.message });
    }
});

module.exports = router;
