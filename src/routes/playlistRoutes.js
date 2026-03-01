const express = require('express');
const router = express.Router();
const playlistController = require('../controllers/playlistController');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

router.post('/', protect, asyncHandler(playlistController.createPlaylist));
router.get('/', protect, asyncHandler(playlistController.getUserPlaylists));
router.get('/:id', protect, asyncHandler(playlistController.getPlaylistById));
router.delete('/:id', protect, asyncHandler(playlistController.deletePlaylist));

router.post('/:id/add', protect, asyncHandler(playlistController.addVideoToPlaylist));
router.delete('/:id/remove/:videoId', protect, asyncHandler(playlistController.removeVideoFromPlaylist));
router.put('/:id/reorder', protect, asyncHandler(playlistController.reorderPlaylist));

module.exports = router;
