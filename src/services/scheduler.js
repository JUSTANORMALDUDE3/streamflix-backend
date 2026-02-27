/**
 * Scheduler Service
 * Runs every 60 seconds to publish scheduled videos whose publishAt <= now.
 * Started once when server boots; uses setInterval — no external cron dependency.
 */
const Video = require('../models/Video');

const INTERVAL_MS = 60 * 1000; // 60 seconds

const runScheduler = async () => {
    try {
        const now = new Date();
        const result = await Video.updateMany(
            { status: 'scheduled', publishAt: { $lte: now } },
            { $set: { status: 'published' } }
        );
        if (result.modifiedCount > 0) {
            console.log(`[Scheduler] Published ${result.modifiedCount} scheduled video(s) at ${now.toISOString()}`);
        }
    } catch (err) {
        console.error('[Scheduler] Error publishing scheduled videos:', err.message);
    }
};

const startScheduler = () => {
    console.log('[Scheduler] Started — checking every 60s for scheduled videos.');
    runScheduler(); // run immediately on start
    setInterval(runScheduler, INTERVAL_MS);
};

module.exports = { startScheduler };
