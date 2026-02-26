const express = require('express');
const router = express.Router();
const { protect, authorizeRoles } = require('../middleware/auth');
const { google } = require('googleapis');
const Video = require('../models/Video');

// --- Re-use the same OAuth2 client from driveService ---
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);
if (process.env.GOOGLE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
}
const drive = google.drive({ version: 'v3', auth: oauth2Client });

// ------------------------------------------------------------
// GET /admin/drive/stream/:fileId
// Admin-only proxy: streams a Drive file directly by its raw Drive fileId.
// Used by the frontend to load a <video> element for thumbnail generation.
// ------------------------------------------------------------
router.get('/stream/:fileId', protect, authorizeRoles('admin'), async (req, res) => {
    try {
        const { fileId } = req.params;

        // Get file size for headers
        const meta = await drive.files.get({ fileId, fields: 'size, mimeType' });
        const fileSize = parseInt(meta.data.size || '0', 10);
        const mimeType = meta.data.mimeType || 'video/mp4';

        const range = req.headers.range;
        let start = 0, end = Math.min(10 * 1024 * 1024 - 1, fileSize - 1); // first 10 MB
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            start = parseInt(parts[0], 10) || 0;
            end = parts[1] ? Math.min(parseInt(parts[1], 10), fileSize - 1) : end;
        }

        const driveRes = await drive.files.get(
            { fileId, alt: 'media', acknowledgeAbuse: true },
            { responseType: 'stream', headers: { Range: `bytes=${start}-${end}` } }
        );

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
            'Content-Type': mimeType,
        });
        driveRes.data.pipe(res);
    } catch (err) {
        console.error('Admin drive stream error:', err);
        res.status(500).json({ message: 'Stream failed', error: err.message });
    }
});


async function listFilesInFolder(folderId) {
    const files = [];
    let pageToken = null;
    do {
        const res = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false and mimeType contains 'video/'`,
            fields: 'nextPageToken, files(id, name, mimeType, size)',
            pageSize: 200,
            pageToken: pageToken || undefined,
        });
        files.push(...(res.data.files || []));
        pageToken = res.data.nextPageToken;
    } while (pageToken);
    return files;
}

// ------------------------------------------------------------
// GET /admin/drive/unregistered
// Scans all configured Drive folders and returns files that
// are NOT yet stored in MongoDB (no matching driveFileId).
// ------------------------------------------------------------
router.get('/unregistered', protect, authorizeRoles('admin'), async (req, res) => {
    try {
        const folderMap = {
            top: process.env.DRIVE_FOLDER_TOP,
            middle: process.env.DRIVE_FOLDER_MIDDLE,
            free: process.env.DRIVE_FOLDER_FREE,
        };

        // Collect all Drive files across all rank folders
        const driveFiles = [];
        for (const [rank, folderId] of Object.entries(folderMap)) {
            if (!folderId) continue;
            const files = await listFilesInFolder(folderId);
            files.forEach(f => driveFiles.push({ ...f, folderId, rank }));
        }

        if (driveFiles.length === 0) {
            return res.json([]);
        }

        // Fetch all driveFileIds already registered in MongoDB
        const driveFileIds = driveFiles.map(f => f.id);
        const registered = await Video.find(
            { driveFileId: { $in: driveFileIds } },
            { driveFileId: 1 }
        ).lean();

        const registeredSet = new Set(registered.map(v => v.driveFileId));

        // Return only the files not in MongoDB
        const unregistered = driveFiles
            .filter(f => !registeredSet.has(f.id))
            .map(f => ({
                fileId: f.id,
                name: f.name,
                mimeType: f.mimeType,
                size: f.size ? parseInt(f.size, 10) : 0,
                folderId: f.folderId,
                rank: f.rank,
            }));

        res.json(unregistered);
    } catch (err) {
        console.error('Drive scan error:', err);
        res.status(500).json({ message: 'Failed to scan Drive folders', error: err.message });
    }
});

// ------------------------------------------------------------
// POST /admin/drive/register
// Creates a Video document from an existing Drive file.
// Body: { fileId, folderId, title, description, rank, thumbnailUrl }
// ------------------------------------------------------------
router.post('/register', protect, authorizeRoles('admin'), async (req, res) => {
    try {
        const { fileId, folderId, title, description, rank, thumbnailUrl } = req.body;

        if (!fileId || !title || !rank) {
            return res.status(400).json({ message: 'fileId, title, and rank are required' });
        }

        // Prevent duplicate registration
        const exists = await Video.findOne({ driveFileId: fileId });
        if (exists) {
            return res.status(409).json({ message: 'This file is already registered in the database.' });
        }

        const video = await Video.create({
            title,
            description: description || '',
            rank,
            driveFileId: fileId,
            thumbnailUrl: thumbnailUrl || '',
            uploadDate: new Date(),
        });

        res.status(201).json({ message: 'Video registered successfully', video });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ message: 'Failed to register video', error: err.message });
    }
});

module.exports = router;
