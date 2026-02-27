const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./src/config/db');

if (process.env.NODE_ENV !== 'test') {
    connectDB();
}

const app = express();

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || origin.startsWith('http://localhost') || origin.endsWith('.vercel.app') || origin === 'https://your-firebase-app.web.app') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ── Health check ─────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.status(200).json({ status: 'OK', message: 'Backend is running' }));

// ── Routes ───────────────────────────────────────────────────────────
app.use('/api/videos', require('./src/routes/videoRoutes'));
app.use('/api/admin/tokens', require('./src/routes/adminTokens'));
app.use('/api/admin/drive', require('./src/routes/driveScanner'));
app.use('/api/admin/videos/bulk', require('./src/routes/adminBulk'));
app.use('/api/admin/system/health', require('./src/routes/health'));
app.use('/api/analytics', require('./src/routes/analytics'));
app.use('/api/admin/analytics', require('./src/routes/analytics'));
app.use('/api/admin', require('./src/routes/adminRoutes'));
app.use('/api/auth', require('./src/routes/authRoutes'));
app.use('/api/download', require('./src/routes/downloadVerify'));
app.use('/api', require('./src/routes/authRoutes'));

// ── Error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong on the server', error: err.message });
});

module.exports = app;
