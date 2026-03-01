const express = require('express');
const router = express.Router();
const { loginUser, logoutUser, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

router.post('/login', asyncHandler(loginUser)); // Changed from POST /api/login to POST /api/auth/login for organization
router.post('/logout', asyncHandler(logoutUser));
router.get('/me', protect, asyncHandler(getMe));

module.exports = router;
