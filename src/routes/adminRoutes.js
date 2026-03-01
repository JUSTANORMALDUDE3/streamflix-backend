const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, authorizeRoles } = require('../middleware/auth');
const adminController = require('../controllers/adminController');
const DriveStorage = require('../services/driveStorage');
const asyncHandler = require('../utils/asyncHandler');

// Multer configured to pipe directly to Google Drive via custom storage engine
const upload = multer({ storage: new DriveStorage() });

// Admin Auth Drive Routes (Not protected so admin can easily auth locally if needed, or protect if desired. Better to protect)
router.get('/auth/drive', asyncHandler(adminController.getAuthUrl));
router.get('/oauth2callback', asyncHandler(adminController.handleCallback)); // Called by Google, can't easily protect with JWT

// User Management
router.post('/users', protect, authorizeRoles('admin'), asyncHandler(adminController.addUser));
router.delete('/users/:id', protect, authorizeRoles('admin'), asyncHandler(adminController.deleteUser));
router.get('/users', protect, authorizeRoles('admin'), asyncHandler(adminController.getUsers));

// Video Upload
router.post('/upload', protect, authorizeRoles('admin'), upload.single('video'), asyncHandler(adminController.uploadVideo));

// Video Management
router.get('/videos', protect, authorizeRoles('admin'), asyncHandler(adminController.getAllVideos));
router.get('/videos/check-duplicate', protect, authorizeRoles('admin'), asyncHandler(adminController.checkDuplicateVideo));
router.put('/videos/:id', protect, authorizeRoles('admin'), asyncHandler(adminController.updateVideo));
router.delete('/videos/:id', protect, authorizeRoles('admin'), asyncHandler(adminController.deleteVideo));

module.exports = router;
