const express = require('express');
const router = express.Router();
const videoController = require('../controllers/videoController');
const { protect, checkRank } = require('../middleware/auth');
const Video = require('../models/Video');
const mongoose = require('mongoose');

// ── Infinite scroll / cursor pagination ─────────────────────────────
// GET /api/videos?cursor=<lastId>&limit=20&category=&search=
router.get('/', protect, async (req, res) => {
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
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
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
});

router.get('/:id', protect, videoController.getVideoById);
router.get('/stream/:id', protect, checkRank, videoController.streamVideo);
router.post('/:id/like', protect, videoController.likeVideo);
router.post('/:id/dislike', protect, videoController.dislikeVideo);
router.post('/:id/view', protect, videoController.addView);

module.exports = router;
