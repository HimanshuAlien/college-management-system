const express = require('express');
const mongoose = require('mongoose');
mongoose.set('strictPopulate', false);

const cors = require('cors');
const path = require('path');
require('dotenv').config();

const teacherRoutes = require('./routes/teacher');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ Disable static file caching in development
if (process.env.NODE_ENV !== 'production') {
    app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
        etag: false,
        lastModified: false,
        maxAge: 0
    }));

    // ✅ Disable cache for frontend files too
    app.use(express.static('frontend', {
        etag: false,
        lastModified: false,
        maxAge: 0
    }));
} else {
    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
    app.use(express.static('frontend'));
}

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://your-connection-string';

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('🟢 MongoDB Connected Successfully');
    })
    .catch(err => {
        console.log('❌ MongoDB Connection Error:', err.message);
        process.exit(1);
    });

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/student', require('./routes/student'));
// In server.js - TEMPORARY FIX (no middleware at all)
app.use('/api/teacher', teacherRoutes); // No auth middleware

app.use('/api/admin', require('./routes/admin'));
// Add this line where you have your other routes
app.use('/api/announcements', require('./routes/announcements'));

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// ✅ CORRECT: Catch-all route (MUST have parameter name)
app.get('/*path', (req, res) => {
    if (req.path.startsWith('/api/')) {
        res.status(404).json({ message: 'API endpoint not found' });
    } else {
        res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Frontend: http://localhost:${PORT}`);
    console.log(`📡 API: http://localhost:${PORT}/api`);
});
