const { google } = require('googleapis');
const stream = require('stream');

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

if (process.env.GOOGLE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });
}

const drive = google.drive({ version: 'v3', auth: oauth2Client });

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
        if (targetAccount === 'fallback') {
            console.error('Explicit fallback account upload failed:', error.message);
            throw error;
        }

        console.error('Error uploading to primary Drive:', error.message);

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

const buildStreamResponse = async (activeDrive, fileId, range) => {
    const fileMeta = await activeDrive.files.get({
        fileId,
        fields: 'size,mimeType,name'
    });

    const fileSize = parseInt(fileMeta.data.size, 10);
    const mimeType = fileMeta.data.mimeType || 'video/mp4';

    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10) || 0;
        const end = parts[1] ? Math.min(parseInt(parts[1], 10), fileSize - 1) : fileSize - 1;

        const driveResponse = await activeDrive.files.get(
            { fileId, alt: 'media', acknowledgeAbuse: true },
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
                'Content-Type': mimeType,
                'Cache-Control': 'no-store'
            },
            status: 206
        };
    }

    const driveResponse = await activeDrive.files.get(
        { fileId, alt: 'media', acknowledgeAbuse: true },
        { responseType: 'stream' }
    );

    return {
        stream: driveResponse.data,
        headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': fileSize,
            'Content-Type': mimeType,
            'Cache-Control': 'no-store'
        },
        status: 200
    };
};

const getVideoStream = async (fileId, range) => {
    try {
        return await buildStreamResponse(drive, fileId, range);
    } catch (error) {
        if (fallbackDrive) {
            try {
                return await buildStreamResponse(fallbackDrive, fileId, range);
            } catch (fallbackError) {
                console.error('Error getting stream from fallback Drive:', fallbackError.message);
                throw error;
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
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/drive.file',
        ]
    });
};

const deleteVideoFromDrive = async (fileId) => {
    try {
        await drive.files.delete({ fileId: fileId });
        console.log(`[Drive API] Successfully deleted video ${fileId} from primary drive`);
    } catch (error) {
        if (fallbackDrive) {
            try {
                await fallbackDrive.files.delete({ fileId: fileId });
                console.log(`[Drive API] Successfully deleted video ${fileId} from fallback drive`);
                return;
            } catch (fallbackError) {
                console.error('[Drive API] Fallback deletion also failed:', fallbackError.message);
            }
        }
        console.error('[Drive API] Error deleting from primary Drive:', error.message);
        throw error;
    }
};

const deleteThumbnailFromDrive = async (thumbnailUrl) => {
    if (!thumbnailUrl || !thumbnailUrl.includes('drive.google.com/thumbnail?id=')) return;

    try {
        const urlParams = new URL(thumbnailUrl).searchParams;
        const fileId = urlParams.get('id');
        if (!fileId) return;

        try {
            await drive.files.delete({ fileId: fileId });
            console.log(`[Drive API] Successfully deleted thumbnail ${fileId} from primary drive`);
        } catch (error) {
            if (fallbackDrive) {
                try {
                    await fallbackDrive.files.delete({ fileId: fileId });
                    console.log(`[Drive API] Successfully deleted thumbnail ${fileId} from fallback drive`);
                    return;
                } catch (fallbackError) {
                    console.error('[Drive API] Fallback thumbnail deletion failed:', fallbackError.message);
                }
            }
            console.error('[Drive API] Error deleting thumbnail from primary Drive:', error.message);
        }
    } catch (e) {
        console.error('[Drive API] Error parsing thumbnail URL for deletion:', e.message);
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
    deleteVideoFromDrive,
    deleteThumbnailFromDrive
};
