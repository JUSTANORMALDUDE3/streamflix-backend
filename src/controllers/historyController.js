const WatchHistory = require('../models/WatchHistory');
const mongoose = require('mongoose');

// @route   GET /api/history
// @desc    Get user watch history with pagination
// @access  Private
const getHistory = async (req, res) => {
    try {
        const { cursor, limit = 20 } = req.query;
        const pageSize = Math.min(parseInt(limit) || 20, 50);
        const userId = req.user.id;

        const query = { userId };

        if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
            query._id = { $lt: new mongoose.Types.ObjectId(cursor) };
        }

        const historyRecords = await WatchHistory.find(query)
            .sort({ _id: -1 })
            .limit(pageSize + 1)
            .populate({
                path: 'videoId',
                select: 'title thumbnailUrl rank views uploadDate status'
            });

        const hasMore = historyRecords.length > pageSize;
        const results = hasMore ? historyRecords.slice(0, pageSize) : historyRecords;
        const nextCursor = hasMore ? results[results.length - 1]._id : null;

        res.status(200).json({
            success: true,
            message: 'Watch history retrieved',
            data: {
                history: results,
                nextCursor,
                hasMore
            }
        });
    } catch (error) {
        console.error('getHistory error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch history' });
    }
};

// @route   DELETE /api/history/clear
// @desc    Clear all watch history for user
// @access  Private
const clearHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        await WatchHistory.deleteMany({ userId });
        res.status(200).json({ success: true, message: 'Watch history cleared' });
    } catch (error) {
        console.error('clearHistory error:', error);
        res.status(500).json({ success: false, message: 'Failed to clear history' });
    }
};

// @route   DELETE /api/history/:id
// @desc    Delete specific history item
// @access  Private
const deleteHistoryItem = async (req, res) => {
    try {
        const userId = req.user.id;
        const historyId = req.params.id;

        const item = await WatchHistory.findOneAndDelete({ _id: historyId, userId });
        if (!item) {
            return res.status(404).json({ success: false, message: 'History item not found' });
        }

        res.status(200).json({ success: true, message: 'History item deleted' });
    } catch (error) {
        console.error('deleteHistoryItem error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete history item' });
    }
};

module.exports = {
    getHistory,
    clearHistory,
    deleteHistoryItem
};
