const { google } = require('googleapis');
const { Readable } = require('stream');

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

/**
 * Uploads an image buffer to Google Drive and makes it publicly accessible.
 * 
 * @param {Buffer} buffer - The image buffer to upload
 * @param {String} filename - The filename with extension (e.g. 'thumb_123.jpg')
 * @returns {String} The public Google Drive URL
 */
const uploadThumbnail = async (buffer, filename) => {
    // Retry logic
    let attempts = 0;
    const MAX_ATTEMPTS = 3;

    while (attempts < MAX_ATTEMPTS) {
        attempts++;
        try {
            // Determine folder (using free tier folder or a dedicated thumbnails folder if available, 
            // fallback to root if not explicitly defined in env)
            const parentFolderId = process.env.DRIVE_FOLDER_FREE || null;

            const fileMetadata = {
                name: filename,
            };

            if (parentFolderId) {
                fileMetadata.parents = [parentFolderId];
            }

            // Convert buffer to stream
            const readableStream = new Readable();
            readableStream.push(buffer);
            readableStream.push(null);

            const media = {
                mimeType: 'image/jpeg', // Defaulting to jpeg for thumbnails
                body: readableStream,
            };

            // 1. Upload the file
            const response = await drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id',
            });

            const fileId = response.data.id;

            // 2. Make the file publicly accessible so the HTML img tag can render it
            await drive.permissions.create({
                fileId: fileId,
                requestBody: {
                    role: 'reader',
                    type: 'anyone',
                },
            });

            // 3. Return the standard Google Drive direct content URL
            return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;

        } catch (error) {
            console.error(`[driveUploader] Upload attempt ${attempts} failed:`, error.message);
            if (attempts >= MAX_ATTEMPTS) {
                throw new Error(`Failed to upload thumbnail to Drive after ${MAX_ATTEMPTS} attempts: ${error.message}`);
            }
            // Wait 1 second before retrying
            await new Promise(res => setTimeout(res, 1000));
        }
    }
};

module.exports = {
    uploadThumbnail,
};
