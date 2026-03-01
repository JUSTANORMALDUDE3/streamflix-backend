const express = require('express');
const router = express.Router();
const videoController = require('../controllers/videoController');
const { protect, checkRank } = require('../middleware/auth');
const Video = require('../models/Video');
const mongoose = require('mongoose');
const { cacheMiddleware } = require('../middleware/cacheService');
const asyncHandler = require('../utils/asyncHandler');

// ── Infinite scroll / cursor pagination ─────────────────────────────
// GET /api/videos?cursor=<lastId>&limit=20&category=&search=
router.get('/', protect, cacheMiddleware, asyncHandler(async (req, res) => {
    try {
        const { cursor, limit = 20, category, search } = req.query;
        const pageSize = Math.min(parseInt(limit) || 20, 50); // cap at 50

        // Include published videos AND legacy videos that have no status field yet
        const query = {
            $or: [
                { status: 'published' },
                { status: { $exists: false } },
                { status: null }
            ]
        };

        // Cursor-based: fetch videos with _id < cursor (newer → older)
        if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
            query._id = { $lt: new mongoose.Types.ObjectId(cursor) };
        }

        if (category) query.rank = category;
        if (search) {
            const q = search.trim();
            query.$or = [
                { title: { $regex: q, $options: 'i' } },
                { tags: q.toLowerCase() }
            ];
        }

        const videos = await Video
            .find(query)
            .sort({ _id: -1 })
            .limit(pageSize + 1)  // fetch one extra to know if there's a next page
            .select('-likes -dislikes');

        const hasMore = videos.length > pageSize;
        const results = hasMore ? videos.slice(0, pageSize) : videos;
        const nextCursor = hasMore ? results[results.length - 1]._id : null;

        res.json({ videos: results, nextCursor, hasMore });
    } catch (err) {
        console.error('getVideos error:', err);
        res.status(500).json({ message: 'Failed to fetch videos.' });
    }
}));

router.get('/:id', protect, cacheMiddleware, asyncHandler(videoController.getVideoById));
router.get('/stream/:id', protect, checkRank, asyncHandler(videoController.streamVideo));
router.post('/:id/like', protect, asyncHandler(videoController.likeVideo));
router.post('/:id/dislike', protect, asyncHandler(videoController.dislikeVideo));
router.post('/:id/view', protect, asyncHandler(videoController.addView));

module.exports = router;
