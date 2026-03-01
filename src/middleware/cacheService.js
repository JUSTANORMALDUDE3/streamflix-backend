const NodeCache = require('node-cache');

// Standard TTL: 60 seconds
const cache = new NodeCache({ stdTTL: 60, checkperiod: 70 });

/**
 * Middleware to intercept and serve cached GET requests
 */
const cacheMiddleware = (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
        return next();
    }

    // Use full URL as cache key
    const key = req.originalUrl;
    const cachedResponse = cache.get(key);

    if (cachedResponse) {
        return res.json(cachedResponse);
    } else {
        // Intercept res.json to cache the outgoing data before sending
        res.originalJson = res.json;
        res.json = (body) => {
            cache.set(key, body);
            res.originalJson(body);
        };
        next();
    }
};

/**
 * Clear cache by matching keys dynamically
 * @param {String} prefix - The route prefix to clear (e.g., '/api/videos')
 */
const clearCachePrefix = (prefix) => {
    const keys = cache.keys();
    const keysToDelete = keys.filter(k => k.startsWith(prefix));
    if (keysToDelete.length > 0) {
        cache.del(keysToDelete);
    }
};

module.exports = {
    cache,
    cacheMiddleware,
    clearCachePrefix
};
