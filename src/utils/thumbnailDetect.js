/**
 * Attempts to auto-detect a thumbnail URL from an embed src.
 * Returns a URL string or null (admin must upload thumbnail manually).
 */
const detectThumbnail = (src) => {
    if (!src) return null;

    // YouTube
    if (src.includes('youtube.com/embed/') || src.includes('youtube-nocookie.com/embed/')) {
        const id = src.split('/embed/')[1]?.split('?')[0]?.split('/')[0];
        if (id) return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
    }

    // YouTube short URL youtu.be
    if (src.includes('youtu.be/')) {
        const id = src.split('youtu.be/')[1]?.split('?')[0];
        if (id) return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
    }

    // Vimeo — requires API call, skip for now
    // Dailymotion
    if (src.includes('dailymotion.com/embed/video/')) {
        const id = src.split('/embed/video/')[1]?.split('?')[0];
        if (id) return `https://www.dailymotion.com/thumbnail/video/${id}`;
    }

    // Generic fallback — cannot determine
    return null;
};

module.exports = { detectThumbnail };
