require('dotenv').config({ path: '../.env' });
const { google } = require('googleapis');
const stream = require('stream');

async function testFallbackUpload() {
    console.log("=== Testing Fallback Google Drive Connection ===");
    console.log("Client ID:", process.env.FALLBACK_GOOGLE_CLIENT_ID ? "Loaded" : "MISSING");
    console.log("Client Secret:", process.env.FALLBACK_GOOGLE_CLIENT_SECRET ? "Loaded" : "MISSING");
    console.log("Refresh Token:", process.env.FALLBACK_GOOGLE_REFRESH_TOKEN ? "Loaded" : "MISSING");
    console.log("Folder ID (Free Mode):", process.env.FALLBACK_DRIVE_FOLDER_FREE);

    if (!process.env.FALLBACK_GOOGLE_REFRESH_TOKEN) {
        console.error("NO TOKEN FOUND IN .ENV. Aborting test.");
        return;
    }

    try {
        const fallbackOauth2Client = new google.auth.OAuth2(
            process.env.FALLBACK_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
            process.env.FALLBACK_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
            process.env.FALLBACK_GOOGLE_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI
        );
        fallbackOauth2Client.setCredentials({
            refresh_token: process.env.FALLBACK_GOOGLE_REFRESH_TOKEN
        });

        const fallbackDrive = google.drive({ version: 'v3', auth: fallbackOauth2Client });

        console.log("Attempting to list files to verify auth...");
        const res = await fallbackDrive.files.list({
            pageSize: 1,
            fields: 'files(id, name)',
        });
        console.log("Auth Success! Files listed:", res.data.files);
        console.log("FALLBACK CREDENTIALS ARE VALID.");
    } catch (error) {
        console.error("\n=== FALLBACK AUTHENTICATION FAILED ===");
        console.error("Error Message:", error.message);
        console.error("This means the Google Token in the .env file is either expired, revoked, or invalid.");
    }
}

testFallbackUpload();
