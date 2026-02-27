const express = require('express');
const router = express.Router();
const { protect, authorizeRoles } = require('../middleware/auth');
const Video = require('../models/Video');
const DownloadToken = require('../models/DownloadToken');

// -------------------------------------------------------
// GET /admin/system/health
// Returns platform health: totals and detected issues.
// -------------------------------------------------------
router.get('/', protect, authorizeRoles('admin'), async (req, res) => {
    try {
        const now = new Date();

        // -- Totals ---------------------------------------------------
        const [totalVideos, published, scheduled, draft] = await Promise.all([
            Video.countDocuments({}),
            Video.countDocuments({ status: 'published' }),
            Video.countDocuments({ status: 'scheduled' }),
            Video.countDocuments({ status: 'draft' }),
        ]);

        const [totalTokens, expiredTokens] = await Promise.all([
            DownloadToken.countDocuments({}),
            DownloadToken.countDocuments({ remainingUses: { $lte: 0 } }),
        ]);

        // -- Issues ---------------------------------------------------
        const missingThumbnails = await Video.countDocuments({
            $or: [{ thumbnailUrl: null }, { thumbnailUrl: '' }, { thumbnailUrl: { $exists: false } }]
        });

        const invalidMetadata = await Video.countDocuments({
            $or: [
                { title: { $in: [null, ''] } },
                { rank: { $exists: false } },
            ]
        });

        // Videos scheduled in the past but not yet published (scheduler lag indicator)
        const overdueScheduled = await Video.countDocuments({
            status: 'scheduled',
            publishAt: { $lt: now }
        });

        // Sample of invalid metadata videos for display
        const invalidVideosSample = await Video.find({
            $or: [{ title: { $in: [null, ''] } }, { rank: { $exists: false } }]
        }).select('title rank status').limit(10);

        res.json({
            generatedAt: now,
            totals: {
                videos: { total: totalVideos, published, scheduled, draft },
                tokens: { total: totalTokens, expired: expiredTokens, active: totalTokens - expiredTokens },
            },
            issues: {
                missingThumbnails,
                invalidMetadata,
                overdueScheduled,
                invalidVideosSample,
            }
        });
    } catch (err) {
        console.error('Health check error:', err);
        res.status(500).json({ message: 'Failed to generate health report.', error: err.message });
    }
});

module.exports = router;
