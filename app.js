const express = require('express');
const cors = require('cors');
const compression = require('compression');
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
app.use(compression({
    filter: (req, res) => {
        if (req.headers.range) return false;
        if (req.originalUrl.startsWith('/api/videos/stream/')) return false;
        if (res.getHeader('Accept-Ranges')) return false;
        return compression.filter(req, res);
    }
}));

app.get('/', (req, res) => res.status(200).send('API is running.'));
app.get('/api/health', (req, res) => res.status(200).json({ status: 'OK', message: 'Backend is running' }));

app.use('/api/home', require('./src/routes/homeRoutes'));
app.use('/api/videos', require('./src/routes/videoRoutes'));
app.use('/api/history', require('./src/routes/historyRoutes'));
app.use('/api/playlists', require('./src/routes/playlistRoutes'));
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

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong on the server', error: err.message });
});

module.exports = app;
