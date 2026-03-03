const jwt = require('jsonwebtoken');
const User = require('../models/User');

const extractBearerToken = (req) => {
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        return req.headers.authorization.split(' ')[1];
    }
    return null;
};

const extractToken = (req) => {
    if (req.cookies && req.cookies.jwt) {
        return req.cookies.jwt;
    }

    if (req.query && typeof req.query.token === 'string' && req.query.token.trim()) {
        return req.query.token.trim();
    }

    return extractBearerToken(req);
};

const protect = async (req, res, next) => {
    const token = extractToken(req);

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select('-password');
        if (!req.user) {
            return res.status(401).json({ message: 'User not found' });
        }
        next();
    } catch (error) {
        console.error('Token verification failed:', error.message);
        res.status(401).json({ message: 'Not authorized, token failed' });
    }
};

const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Not authorized' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: `Role ${req.user.role} is not authorized` });
        }
        next();
    };
};

const checkRank = async (req, res, next) => {
    try {
        const Video = require('../models/Video');
        const videoId = req.params.id;
        const video = await Video.findById(videoId);

        if (!video) {
            return res.status(404).json({ message: 'Video not found' });
        }

        const userRank = req.user.rank;
        const mappedRankValue = { top: 3, middle: 2, free: 1 };

        const userValue = mappedRankValue[userRank] || 0;
        const videoValue = mappedRankValue[video.rank] || 3;

        if (userValue >= videoValue) {
            req.video = video;
            next();
        } else {
            return res.status(403).json({ message: 'Rank too low to access this video' });
        }
    } catch (err) {
        console.error('Rank verification error:', err);
        res.status(500).json({ message: 'Server error checking rank' });
    }
};

module.exports = { protect, authorizeRoles, checkRank };
