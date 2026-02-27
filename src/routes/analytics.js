const express = require('express');
const router = express.Router();
const { protect, authorizeRoles } = require('../middleware/auth');
const VideoView = require('../models/VideoView');
const Video = require('../models/Video');

// -------------------------------------------------------
// POST /api/analytics/view
// Records a view event. Protected to avoid abuse.
// Body: { videoId, watchTime }
// -------------------------------------------------------
router.post('/view', protect, async (req, res) => {
    try {
        const { videoId, watchTime = 0 } = req.body;
        if (!videoId) return res.status(400).json({ message: 'videoId is required.' });

        await VideoView.create({
            videoId,
            userId: req.user?._id || null,
            watchTime: Math.max(0, Number(watchTime) || 0),
            viewedAt: new Date()
        });

        res.json({ success: true });
    } catch (err) {
        // Non-critical — don't crash the frontend
        console.error('Analytics view error:', err.message);
        res.json({ success: false });
    }
});

// -------------------------------------------------------
// GET /api/admin/analytics/overview
// Returns: daily views (30d), top 10 videos, active users, total watch time
// -------------------------------------------------------
router.get('/overview', protect, authorizeRoles('admin'), async (req, res) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // --- Daily views last 30 days ---
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

        // --- Top 10 most viewed videos (Legacy + Recent) ---
        const topVideos = await Video.aggregate([
            {
                $lookup: {
                    from: 'videoviews', // MongoDB automatically converts VideoView to lowercased plural
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

        // --- Active unique users last 30 days ---
        const activeUsersResult = await VideoView.aggregate([
            { $match: { viewedAt: { $gte: thirtyDaysAgo }, userId: { $ne: null } } },
            { $group: { _id: '$userId' } },
            { $count: 'count' }
        ]);
        const activeUsers = activeUsersResult[0]?.count || 0;

        // --- Total watch time (seconds) last 30 days ---
        const watchTimeResult = await VideoView.aggregate([
            { $match: { viewedAt: { $gte: thirtyDaysAgo } } },
            { $group: { _id: null, totalSeconds: { $sum: '$watchTime' } } }
        ]);
        const totalWatchTime = watchTimeResult[0]?.totalSeconds || 0;

        // --- Total views ALL TIME (Legacy views + New Event views) ---
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
