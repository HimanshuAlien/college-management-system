const express = require('express');
const router = express.Router();
const Announcement = require('../models/announcements'); // ✅ Now this will work

// Get published announcements for students/teachers
router.get('/', async (req, res) => {
    try {
        const announcements = await Announcement.find({
            status: 'published'  // Only show published ones
        })
            .populate('author', 'name role')  // Get author details
            .sort({ createdAt: -1 })
            .limit(10);

        console.log('📢 Found published announcements:', announcements.length);
        res.json({ announcements });
    } catch (error) {
        console.error('Error fetching announcements:', error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
