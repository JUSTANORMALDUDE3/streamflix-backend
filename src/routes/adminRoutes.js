const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, authorizeRoles } = require('../middleware/auth');
const adminController = require('../controllers/adminController');
const DriveStorage = require('../services/driveStorage');

// Multer configured to pipe directly to Google Drive via custom storage engine
const upload = multer({ storage: new DriveStorage() });

// Admin Auth Drive Routes (Not protected so admin can easily auth locally if needed, or protect if desired. Better to protect)
router.get('/auth/drive', adminController.getAuthUrl);
router.get('/oauth2callback', adminController.handleCallback); // Called by Google, can't easily protect with JWT

// User Management
router.post('/users', protect, authorizeRoles('admin'), adminController.addUser);
router.delete('/users/:id', protect, authorizeRoles('admin'), adminController.deleteUser);
router.get('/users', protect, authorizeRoles('admin'), adminController.getUsers);

// Video Upload
router.post('/upload', protect, authorizeRoles('admin'), upload.single('video'), adminController.uploadVideo);

// Video Management
router.get('/videos', protect, authorizeRoles('admin'), adminController.getAllVideos);
router.put('/videos/:id', protect, authorizeRoles('admin'), adminController.updateVideo);
router.delete('/videos/:id', protect, authorizeRoles('admin'), adminController.deleteVideo);

module.exports = router;
