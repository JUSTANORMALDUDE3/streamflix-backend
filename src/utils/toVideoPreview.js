const MAX_TAGS = 5;

const toVideoPreview = (video) => {
    if (!video) return null;

    const createdAt = video.createdAt || video.uploadDate || null;

    return {
        _id: video._id,
        title: video.title,
        thumbnailUrl: video.thumbnailUrl || '',
        durationSeconds: Math.max(0, Math.round(Number(video.durationSeconds ?? video.duration ?? 0) || 0)),
        views: Math.max(0, Number(video.views) || 0),
        rank: video.rank,
        tags: Array.isArray(video.tags) ? video.tags.slice(0, MAX_TAGS) : [],
        createdAt
    };
};

module.exports = {
    toVideoPreview,
    MAX_TAGS
};
