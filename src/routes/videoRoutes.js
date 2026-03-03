const express = require('express');
const router = express.Router();
const videoController = require('../controllers/videoController');
const { protect, checkRank } = require('../middleware/auth');
const { cacheMiddleware } = require('../middleware/cacheService');
const asyncHandler = require('../utils/asyncHandler');
const { getPreviewPage } = require('../services/videoQueryService');

// GET /api/videos?cursor=<lastId>&limit=20&category=&search=
router.get('/', protect, cacheMiddleware, asyncHandler(async (req, res) => {
    const { cursor, limit = 20, category, search } = req.query;
    const previewPage = await getPreviewPage({ cursor, limit, category, search });

    res.json({
        videos: previewPage.items,
        nextCursor: previewPage.nextCursor,
        hasMore: previewPage.hasMore
    });
}));

router.get('/stream/:id', protect, checkRank, asyncHandler(videoController.streamVideo));
router.get('/:id', protect, cacheMiddleware, asyncHandler(videoController.getVideoById));
router.post('/:id/like', protect, asyncHandler(videoController.likeVideo));
router.post('/:id/dislike', protect, asyncHandler(videoController.dislikeVideo));
router.post('/:id/view', protect, asyncHandler(videoController.addView));

module.exports = router;
