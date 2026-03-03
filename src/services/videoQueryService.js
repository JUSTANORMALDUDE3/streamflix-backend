const mongoose = require('mongoose');
const Video = require('../models/Video');
const VideoView = require('../models/VideoView');
const { toVideoPreview } = require('../utils/toVideoPreview');

const PREVIEW_SELECT = '_id title thumbnailUrl duration durationSeconds rank tags views createdAt uploadDate';

const buildPublishedVideoQuery = ({ cursor, category, search } = {}) => {
    const query = {
        $or: [
            { status: 'published' },
            { status: { $exists: false } },
            { status: null }
        ]
    };

    if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
        query._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    }

    if (category) {
        query.rank = category;
    }

    if (search) {
        const q = search.trim();
        query.$and = [
            {
                $or: [
                    { status: 'published' },
                    { status: { $exists: false } },
                    { status: null }
                ]
            },
            {
                $or: [
                    { title: { $regex: q, $options: 'i' } },
                    { tags: q.toLowerCase() }
                ]
            }
        ];
        delete query.$or;
    }

    return query;
};

const getCombinedViewCounts = async (videoIds = []) => {
    if (!videoIds.length) {
        return new Map();
    }

    const objectIds = videoIds.map((id) => (
        typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
    ));

    const viewCounts = await VideoView.aggregate([
        { $match: { videoId: { $in: objectIds } } },
        { $group: { _id: '$videoId', count: { $sum: 1 } } }
    ]);

    return new Map(viewCounts.map((item) => [String(item._id), item.count]));
};

const attachCombinedViews = async (videos = []) => {
    if (!videos.length) return [];

    const viewCountMap = await getCombinedViewCounts(videos.map((video) => video._id));

    return videos.map((video) => ({
        ...video,
        views: (video.views || 0) + (viewCountMap.get(String(video._id)) || 0)
    }));
};

const getPreviewPage = async ({ cursor, limit = 20, category, search } = {}) => {
    const pageSize = Math.min(parseInt(limit, 10) || 20, 50);

    const query = buildPublishedVideoQuery({ cursor, category, search });
    const docs = await Video.find(query)
        .sort({ _id: -1 })
        .limit(pageSize + 1)
        .select(PREVIEW_SELECT)
        .lean();

    const hasMore = docs.length > pageSize;
    const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;
    const withViews = await attachCombinedViews(pageDocs);

    return {
        items: withViews.map(toVideoPreview),
        nextCursor: hasMore ? String(pageDocs[pageDocs.length - 1]._id) : null,
        hasMore
    };
};

const getTrendingPreviews = async (limit = 8) => {
    const docs = await Video.find(buildPublishedVideoQuery())
        .sort({ views: -1, createdAt: -1, uploadDate: -1 })
        .limit(limit)
        .select(PREVIEW_SELECT)
        .lean();

    const withViews = await attachCombinedViews(docs);
    return withViews.map(toVideoPreview);
};

const getPopularTags = async (limit = 8) => {
    const tags = await Video.aggregate([
        {
            $match: {
                $or: [
                    { status: 'published' },
                    { status: { $exists: false } },
                    { status: null }
                ]
            }
        },
        { $unwind: '$tags' },
        { $match: { tags: { $type: 'string', $ne: '' } } },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: limit }
    ]);

    return tags.map((item) => ({ tag: item._id, count: item.count }));
};

module.exports = {
    PREVIEW_SELECT,
    buildPublishedVideoQuery,
    getCombinedViewCounts,
    attachCombinedViews,
    getPreviewPage,
    getTrendingPreviews,
    getPopularTags
};
