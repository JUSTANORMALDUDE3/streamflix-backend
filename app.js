const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./src/config/db');

// Initialize DB if not in test environment (Firebase might handle this differently depending on deployment, but standard for now)
if (process.env.NODE_ENV !== 'test') {
    connectDB();
}

const app = express();

// Middleware
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

// Routes go here
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Backend is running' });
});

// Import actual routes
app.use('/api/videos', require('./src/routes/videoRoutes'));
app.use('/api/admin/tokens', require('./src/routes/adminTokens'));
app.use('/api/admin/drive', require('./src/routes/driveScanner'));
app.use('/api/admin/embed', require('./src/routes/embedVideo'));
app.use('/api/admin', require('./src/routes/adminRoutes'));
app.use('/api/auth', require('./src/routes/authRoutes'));
app.use('/api/download', require('./src/routes/downloadVerify'));
app.use('/api', require('./src/routes/authRoutes')); // For /api/login compatibility if frontend expects it there


// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong on the server', error: err.message });
});

module.exports = app;
