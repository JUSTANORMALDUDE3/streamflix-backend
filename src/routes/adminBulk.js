const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect, authorizeRoles } = require('../middleware/auth');
const Video = require('../models/Video');
const { normalizeTags } = require('../utils/normalizeTags');

// -------------------------------------------------------
// POST /admin/videos/bulk
// Body: { action, videoIds, data }
// Actions: delete | changeRank | addTags | removeTags | regenThumb
// -------------------------------------------------------
router.post('/', protect, authorizeRoles('admin'), async (req, res) => {
    try {
        const { action, videoIds, data = {} } = req.body;

        if (!action || !Array.isArray(videoIds) || videoIds.length === 0) {
            return res.status(400).json({ message: 'action and a non-empty videoIds array are required.' });
        }

        // Validate all IDs are valid ObjectIds
        const ids = videoIds
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));

        if (ids.length === 0) {
            return res.status(400).json({ message: 'No valid video IDs provided.' });
        }

        let result;

        switch (action) {
            case 'delete': {
                result = await Video.deleteMany({ _id: { $in: ids } });
                return res.json({ success: true, deletedCount: result.deletedCount });
            }

            case 'changeRank': {
                const { rank } = data;
                if (!['top', 'middle', 'free'].includes(rank)) {
                    return res.status(400).json({ message: 'Invalid rank. Must be top, middle, or free.' });
                }
                result = await Video.updateMany({ _id: { $in: ids } }, { $set: { rank } });
                return res.json({ success: true, modifiedCount: result.modifiedCount });
            }

            case 'addTags': {
                const { tags } = data;
                if (!Array.isArray(tags) || tags.length === 0) {
                    return res.status(400).json({ message: 'tags array required for addTags action.' });
                }
                const cleanTags = normalizeTags(tags);
                result = await Video.updateMany(
                    { _id: { $in: ids } },
                    { $addToSet: { tags: { $each: cleanTags } } }
                );
                return res.json({ success: true, modifiedCount: result.modifiedCount });
            }

            case 'removeTags': {
                const { tags } = data;
                if (!Array.isArray(tags) || tags.length === 0) {
                    return res.status(400).json({ message: 'tags array required for removeTags action.' });
                }
                result = await Video.updateMany(
                    { _id: { $in: ids } },
                    { $pull: { tags: { $in: tags } } }
                );
                return res.json({ success: true, modifiedCount: result.modifiedCount });
            }

            case 'changeStatus': {
                const { status } = data;
                if (!['draft', 'scheduled', 'published'].includes(status)) {
                    return res.status(400).json({ message: 'Invalid status.' });
                }
                result = await Video.updateMany(
                    { _id: { $in: ids } },
                    { $set: { status } }
                );
                return res.json({ success: true, modifiedCount: result.modifiedCount });
            }

            default:
                return res.status(400).json({ message: `Unknown action: ${action}` });
        }
    } catch (err) {
        console.error('Bulk action error:', err);
        res.status(500).json({ message: 'Failed to perform bulk action.', error: err.message });
    }
});

module.exports = router;
