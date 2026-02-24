const express = require('express');
const router = express.Router();
const { loginUser, logoutUser, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/login', loginUser); // Changed from POST /api/login to POST /api/auth/login for organization
router.post('/logout', logoutUser);
router.get('/me', protect, getMe);

module.exports = router;
