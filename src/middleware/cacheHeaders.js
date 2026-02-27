/**
 * Cache Headers Middleware
 * Add immutable cache headers to thumbnail responses so browsers/CDNs
 * cache thumbnails for 1 year and never re-request them.
 */
const addCacheHeaders = (req, res, next) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Vary', 'Accept-Encoding');
    next();
};

module.exports = { addCacheHeaders };
