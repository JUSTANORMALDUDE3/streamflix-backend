const express = require('express');
const NodeCache = require('node-cache');
const router = express.Router();
const { protect, authorizeRoles } = require('../middleware/auth');
const VideoView = require('../models/VideoView');
const Video = require('../models/Video');
const WatchHistory = require('../models/WatchHistory');
const { clearCachePrefix } = require('../middleware/cacheService');

const VIEW_THRESHOLD_SECONDS = 10;
const WATCHTIME_DELTA_MAX_SECONDS = 60;
const VIEW_COOLDOWN_SECONDS = 10 * 60;
const viewCooldownCache = new NodeCache({ stdTTL: VIEW_COOLDOWN_SECONDS, checkperiod: VIEW_COOLDOWN_SECONDS + 30 });

const invalidateVideoCaches = () => {
    clearCachePrefix('/api/videos');
    clearCachePrefix('/api/home');
    clearCachePrefix('/api/analytics');
    clearCachePrefix('/api/admin/analytics');
};

const getCooldownKey = (req, videoId) => {
    const identity = req.user?._id?.toString() || req.ip || 'anonymous';
    return `${identity}:${videoId}`;
};

const getStartOfDay = () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return startOfDay;
};

const upsertWatchHistory = async ({ userId, videoId, deltaSeconds = 0 }) => {
    if (!userId) return null;

    const startOfDay = getStartOfDay();

    return WatchHistory.findOneAndUpdate(
        {
            userId,
            videoId,
            watchedAt: { $gte: startOfDay }
        },
        {
            $set: { watchedAt: new Date() },
            $inc: { watchDuration: Math.max(0, Number(deltaSeconds) || 0) }
        },
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true
        }
    );
};

router.post('/view', protect, async (req, res) => {
    try {
        const { videoId, watchedSeconds = 0 } = req.body;
        const normalizedWatchedSeconds = Math.max(0, Number(watchedSeconds) || 0);

        if (!videoId) {
            return res.status(400).json({ message: 'videoId is required.' });
        }

        if (normalizedWatchedSeconds < VIEW_THRESHOLD_SECONDS) {
            return res.status(202).json({ success: true, counted: false, views: null });
        }

        const video = await Video.findById(videoId).select('views');
        if (!video) {
            return res.status(404).json({ message: 'Video not found.' });
        }

        const cooldownKey = getCooldownKey(req, videoId);
        if (viewCooldownCache.get(cooldownKey)) {
            const eventViews = await VideoView.countDocuments({ videoId });
            return res.json({
                success: true,
                counted: false,
                views: (video.views || 0) + eventViews
            });
        }

        await VideoView.create({
            videoId,
            userId: req.user?._id || null,
            watchTime: normalizedWatchedSeconds,
            viewedAt: new Date()
        });

        await upsertWatchHistory({
            userId: req.user?._id,
            videoId,
            deltaSeconds: normalizedWatchedSeconds
        });

        viewCooldownCache.set(cooldownKey, true);

        const eventViews = await VideoView.countDocuments({ videoId });
        invalidateVideoCaches();

        res.json({
            success: true,
            counted: true,
            views: (video.views || 0) + eventViews
        });
    } catch (err) {
        console.error('Analytics view error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to record view.' });
    }
});

router.post('/watchtime', protect, async (req, res) => {
    try {
        const { videoId, deltaSeconds = 0 } = req.body;
        const normalizedDeltaSeconds = Math.min(
            WATCHTIME_DELTA_MAX_SECONDS,
            Math.max(0, Number(deltaSeconds) || 0)
        );

        if (!videoId) {
            return res.status(400).json({ message: 'videoId is required.' });
        }

        if (normalizedDeltaSeconds <= 0) {
            return res.status(202).json({ success: true, updated: false });
        }

        const videoExists = await Video.exists({ _id: videoId });
        if (!videoExists) {
            return res.status(404).json({ message: 'Video not found.' });
        }

        await upsertWatchHistory({
            userId: req.user?._id,
            videoId,
            deltaSeconds: normalizedDeltaSeconds
        });

        clearCachePrefix('/api/home');
        clearCachePrefix('/api/admin/analytics');

        res.json({ success: true, updated: true });
    } catch (err) {
        console.error('Analytics watchtime error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to record watch time.' });
    }
});

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

        const watchTimeResult = await WatchHistory.aggregate([
            { $match: { watchedAt: { $gte: thirtyDaysAgo } } },
            { $group: { _id: null, totalSeconds: { $sum: '$watchDuration' } } }
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
