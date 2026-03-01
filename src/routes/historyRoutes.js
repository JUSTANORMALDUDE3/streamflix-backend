const express = require('express');
const router = express.Router();
const historyController = require('../controllers/historyController');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

// Note: Order matters. Put /clear before /:id so it doesn't try to parse "clear" as an ObjectId
router.delete('/clear', protect, asyncHandler(historyController.clearHistory));
router.delete('/:id', protect, asyncHandler(historyController.deleteHistoryItem));

// GET /api/history?cursor=...&limit=20
router.get('/', protect, asyncHandler(historyController.getHistory));

module.exports = router;
