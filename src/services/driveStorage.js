const driveService = require('./driveService');

function DriveStorage() { }

DriveStorage.prototype._handleFile = function _handleFile(req, file, cb) {
    // Ensure rank is available (must be appended to FormData before the video file)
    const rank = req.body.rank || 'free';

    // Pipe the multipart file stream directly into the Google Drive API upload stream
    driveService.uploadVideoToDrive(file.stream, file.originalname, file.mimetype, rank)
        .then(driveFileId => {
            // Signal Multer that the file has been fully processed and stored
            cb(null, { driveFileId });
        })
        .catch(err => {
            console.error('DriveStorage Upload Stream Error:', err);
            cb(err);
        });
};

DriveStorage.prototype._removeFile = function _removeFile(req, file, cb) {
    // No local files exist to remove
    cb(null);
};

module.exports = DriveStorage;
