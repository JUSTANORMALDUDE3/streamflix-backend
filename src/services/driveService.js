const { google } = require('googleapis');
const stream = require('stream');

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// If there's a refresh token in env, set it
if (process.env.GOOGLE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });
}

const drive = google.drive({ version: 'v3', auth: oauth2Client });

const uploadVideoToDrive = async (fileStream, originalName, mimeType, rank) => {
    try {
        let folderId;
        switch (rank) {
            case 'top': folderId = process.env.DRIVE_FOLDER_TOP; break;
            case 'middle': folderId = process.env.DRIVE_FOLDER_MIDDLE; break;
            case 'free': folderId = process.env.DRIVE_FOLDER_FREE; break;
            default: throw new Error('Invalid rank folder mapping');
        }

        if (!folderId) {
            throw new Error(`Folder ID for rank '${rank}' is missing in environment variables.`);
        }

        const fileMetadata = {
            name: originalName,
            parents: [folderId]
        };

        const media = {
            mimeType: mimeType,
            body: fileStream
        };

        const response = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id'
        });

        return response.data.id;
    } catch (error) {
        console.error('Error uploading to Drive:', error);
        throw error;
    }
};

const getVideoStream = async (fileId, range) => {
    try {
        // Fetch absolute metadata footprint
        const fileMeta = await drive.files.get({
            fileId: fileId,
            fields: 'size'
        });
        const fileSize = parseInt(fileMeta.data.size, 10);

        // Clamp chunks to 10MB chunks to instantly stream
        const CHUNK_SIZE = 10 * 1024 * 1024;
        let start = 0;
        let end = fileSize - 1;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            start = parseInt(parts[0], 10) || 0;
            const requestedEnd = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            end = Math.min(requestedEnd, start + CHUNK_SIZE - 1, fileSize - 1);
        } else {
            // Even if browser doesn't send range natively, force 206 chunking to prevent Drive memory bloat
            end = Math.min(CHUNK_SIZE - 1, fileSize - 1);
        }

        const driveResponse = await drive.files.get(
            { fileId: fileId, alt: 'media', acknowledgeAbuse: true },
            {
                responseType: 'stream',
                headers: { Range: `bytes=${start}-${end}` }
            }
        );

        return {
            stream: driveResponse.data,
            headers: {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': (end - start) + 1,
                'Content-Type': 'video/mp4'
            },
            status: 206
        };
    } catch (error) {
        console.error('Error getting stream from Drive:', error);
        throw error;
    }
};

const getAuthUrl = () => {
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/drive.file']
    });
};

const deleteVideoFromDrive = async (fileId) => {
    try {
        await drive.files.delete({ fileId: fileId });
    } catch (error) {
        console.error('Error deleting from Drive:', error);
        throw error;
    }
};

const handleCallback = async (code) => {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    return tokens;
};

module.exports = {
    uploadVideoToDrive,
    getVideoStream,
    getAuthUrl,
    handleCallback,
    deleteVideoFromDrive
};
