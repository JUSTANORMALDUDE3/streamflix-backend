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

// --- Fallback Client Setup ---
let fallbackDrive = null;
if (process.env.FALLBACK_GOOGLE_REFRESH_TOKEN) {
    const fallbackOauth2Client = new google.auth.OAuth2(
        process.env.FALLBACK_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
        process.env.FALLBACK_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
        process.env.FALLBACK_GOOGLE_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI
    );
    fallbackOauth2Client.setCredentials({
        refresh_token: process.env.FALLBACK_GOOGLE_REFRESH_TOKEN
    });
    fallbackDrive = google.drive({ version: 'v3', auth: fallbackOauth2Client });
    console.log('[Drive API] Secondary Fallback Client Initialized');
}

const uploadVideoToDrive = async (fileStream, originalName, mimeType, rank, targetAccount = 'primary') => {
    try {
        const media = {
            mimeType: mimeType,
            body: fileStream
        };

        // If admin explicitly requested the fallback account, skip primary upload attempt
        if (targetAccount === 'fallback' && fallbackDrive) {
            console.log('Explicit fallback account requested. Skipping primary drive.');
            let fallbackFolderId;
            switch (rank) {
                case 'top': fallbackFolderId = process.env.FALLBACK_DRIVE_FOLDER_TOP; break;
                case 'middle': fallbackFolderId = process.env.FALLBACK_DRIVE_FOLDER_MIDDLE; break;
                case 'free': fallbackFolderId = process.env.FALLBACK_DRIVE_FOLDER_FREE; break;
                default: throw new Error('Invalid rank folder mapping');
            }

            if (!fallbackFolderId) throw new Error(`Fallback folder ID for rank '${rank}' is missing in environment variables.`);

            const response = await fallbackDrive.files.create({
                resource: { name: originalName, parents: [fallbackFolderId] },
                media: media,
                fields: 'id'
            });
            console.log('Successfully uploaded explicitly to fallback drive.');
            return response.data.id;
        }

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

        const response = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id'
        });

        return response.data.id;
    } catch (error) {
        // If the admin targeted 'fallback' from the start, we don't try the fallback AGAIN
        // if it threw an error (e.g., unauthorized client), because the stream is already consumed.
        if (targetAccount === 'fallback') {
            console.error('Explicit fallback account upload failed:', error.message);
            throw error;
        }

        console.error('Error uploading to primary Drive:', error.message);

        // Failover Logic: If primary failed and we didn't explicitly request fallback, try fallback now
        if (fallbackDrive) {
            console.log('Attempting failover upload to secondary fallback drive...');
            try {
                let fallbackFolderId;
                switch (rank) {
                    case 'top': fallbackFolderId = process.env.FALLBACK_DRIVE_FOLDER_TOP; break;
                    case 'middle': fallbackFolderId = process.env.FALLBACK_DRIVE_FOLDER_MIDDLE; break;
                    case 'free': fallbackFolderId = process.env.FALLBACK_DRIVE_FOLDER_FREE; break;
                }

                if (!fallbackFolderId) {
                    throw new Error(`Fallback folder ID for rank '${rank}' is missing in environment variables.`);
                }

                const fallbackResponse = await fallbackDrive.files.create({
                    resource: { name: originalName, parents: [fallbackFolderId] },
                    media: { mimeType: mimeType, body: fileStream },
                    fields: 'id'
                });

                console.log('Successfully uploaded via failover to fallback drive.');
                return fallbackResponse.data.id;
            } catch (fallbackError) {
                console.error('Error uploading during failover to fallback Drive:', fallbackError.message);
                throw fallbackError;
            }
        }

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
        if (fallbackDrive) {
            try {
                // Fetch absolute metadata footprint from fallback
                const fileMeta = await fallbackDrive.files.get({
                    fileId: fileId,
                    fields: 'size'
                });
                const fileSize = parseInt(fileMeta.data.size, 10);

                const CHUNK_SIZE = 10 * 1024 * 1024;
                let start = 0;
                let end = fileSize - 1;

                if (range) {
                    const parts = range.replace(/bytes=/, "").split("-");
                    start = parseInt(parts[0], 10) || 0;
                    const requestedEnd = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                    end = Math.min(requestedEnd, start + CHUNK_SIZE - 1, fileSize - 1);
                } else {
                    end = Math.min(CHUNK_SIZE - 1, fileSize - 1);
                }

                const fallbackDriveResponse = await fallbackDrive.files.get(
                    { fileId: fileId, alt: 'media', acknowledgeAbuse: true },
                    {
                        responseType: 'stream',
                        headers: { Range: `bytes=${start}-${end}` }
                    }
                );

                return {
                    stream: fallbackDriveResponse.data,
                    headers: {
                        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Length': (end - start) + 1,
                        'Content-Type': 'video/mp4'
                    },
                    status: 206
                };
            } catch (fallbackError) {
                console.error('Error getting stream from fallback Drive:', fallbackError.message);
                throw error; // throw original
            }
        }
        console.error('Error getting stream from Drive:', error.message);
        throw error;
    }
};

const getDownloadStream = async (fileId) => {
    try {
        const response = await drive.files.get(
            { fileId: fileId, alt: 'media', acknowledgeAbuse: true },
            { responseType: 'stream' }
        );
        return response.data;
    } catch (error) {
        if (fallbackDrive) {
            try {
                const fallbackResponse = await fallbackDrive.files.get(
                    { fileId: fileId, alt: 'media', acknowledgeAbuse: true },
                    { responseType: 'stream' }
                );
                return fallbackResponse.data;
            } catch (fallbackError) { }
        }
        console.error('Error getting download stream from Drive:', error.message);
        throw error;
    }
};

const getAuthUrl = (accountType = 'primary') => {
    const activeClient = accountType === 'fallback' && process.env.FALLBACK_GOOGLE_CLIENT_ID
        ? new google.auth.OAuth2(
            process.env.FALLBACK_GOOGLE_CLIENT_ID,
            process.env.FALLBACK_GOOGLE_CLIENT_SECRET,
            process.env.FALLBACK_GOOGLE_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI
        )
        : oauth2Client;

    return activeClient.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        state: accountType,
        scope: [
            'https://www.googleapis.com/auth/drive',        // Full drive access — required to LIST all files in folders
            'https://www.googleapis.com/auth/drive.file',   // Existing — upload/stream files the app created
        ]
    });
};

const deleteVideoFromDrive = async (fileId) => {
    try {
        await drive.files.delete({ fileId: fileId });
    } catch (error) {
        if (fallbackDrive) {
            try {
                await fallbackDrive.files.delete({ fileId: fileId });
                return;
            } catch (fallbackError) { }
        }
        console.error('Error deleting from Drive:', error.message);
        throw error;
    }
};

const handleCallback = async (code, accountType = 'primary') => {
    const activeClient = accountType === 'fallback' && process.env.FALLBACK_GOOGLE_CLIENT_ID
        ? new google.auth.OAuth2(
            process.env.FALLBACK_GOOGLE_CLIENT_ID,
            process.env.FALLBACK_GOOGLE_CLIENT_SECRET,
            process.env.FALLBACK_GOOGLE_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI
        )
        : oauth2Client;

    const { tokens } = await activeClient.getToken(code);
    activeClient.setCredentials(tokens);
    return tokens;
};

module.exports = {
    uploadVideoToDrive,
    getVideoStream,
    getDownloadStream,
    getAuthUrl,
    handleCallback,
    deleteVideoFromDrive
};
