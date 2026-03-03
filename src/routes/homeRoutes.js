const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { cacheMiddleware } = require('../middleware/cacheService');
const VideoView = require('../models/VideoView');
const WatchHistory = require('../models/WatchHistory');
const Video = require('../models/Video');
const {
    getPreviewPage,
    getTrendingPreviews,
    getPopularTags
} = require('../services/videoQueryService');

router.get('/', protect, cacheMiddleware, async (req, res) => {
    try {
        const { cursor = null, limit = 20, rangeDays = 30 } = req.query;
        const normalizedRangeDays = Math.max(1, Math.min(parseInt(rangeDays, 10) || 30, 365));
        const since = new Date();
        since.setDate(since.getDate() - normalizedRangeDays);

        const feed = await getPreviewPage({ cursor, limit });
        const [trending, popularTags, activeUsersResult, watchTimeResult, legacyViewsResult, newTotal] = await Promise.all([
            getTrendingPreviews(6),
            getPopularTags(8),
            VideoView.aggregate([
                { $match: { viewedAt: { $gte: since }, userId: { $ne: null } } },
                { $group: { _id: '$userId' } },
                { $count: 'count' }
            ]),
            WatchHistory.aggregate([
                { $match: { watchedAt: { $gte: since } } },
                { $group: { _id: null, totalSeconds: { $sum: '$watchDuration' } } }
            ]),
            Video.aggregate([
                { $group: { _id: null, total: { $sum: '$views' } } }
            ]),
            VideoView.countDocuments()
        ]);

        const activeUsers = activeUsersResult[0]?.count || 0;
        const totalWatchTimeSeconds = watchTimeResult[0]?.totalSeconds || 0;
        const legacyTotalViews = legacyViewsResult[0]?.total || 0;

        res.json({
            feed,
            trending,
            popularTags,
            kpis: {
                totalViews: legacyTotalViews + newTotal,
                activeUsers,
                watchTimeMinutes: Math.round(totalWatchTimeSeconds / 60)
            }
        });
    } catch (error) {
        console.error('Home route error:', error);
        res.status(500).json({ message: 'Failed to load home feed.' });
    }
});

module.exports = router;
