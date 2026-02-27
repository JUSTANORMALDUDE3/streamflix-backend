const normalizeTags = (tags) => {
    if (!tags) return [];
    if (typeof tags === 'string') {
        tags = tags.split(',');
    }
    if (!Array.isArray(tags)) return [];
    return [...new Set(
        tags.map(t => t.toLowerCase().trim()).filter(Boolean)
    )];
};

module.exports = { normalizeTags };
