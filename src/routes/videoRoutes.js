const express = require('express');
const router = express.Router();
const videoController = require('../controllers/videoController');
const { protect, checkRank } = require('../middleware/auth');

router.get('/', protect, videoController.getVideos);
router.get('/:id', protect, checkRank, videoController.getVideoById);
router.get('/stream/:id', protect, checkRank, videoController.streamVideo);
router.post('/:id/like', protect, videoController.likeVideo);
router.post('/:id/dislike', protect, videoController.dislikeVideo);
router.post('/:id/view', protect, videoController.addView);

module.exports = router;
