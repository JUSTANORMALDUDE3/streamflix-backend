/**
 * Async Error Handler Middleware
 * Wraps async routes/controllers to seamlessly catch and forward rejections
 * to the centralized Express error handling flow.
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
