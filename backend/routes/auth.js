const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const User = require('../models/User');
const { JWT_SECRET, auth } = require('../middleware/auth');

const router = express.Router();

// Multer setup for profile images
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'backend/uploads/profiles/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

// Register
// Register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, role, rollNumber, branch, year, department, classId } = req.body;

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Create user
        const userData = { name, email, password, role };

        if (role === 'student') {
            userData.rollNumber = rollNumber;
            userData.branch = branch;
            userData.year = year;

            // 🔧 FIX: Handle empty classId
            if (classId && classId.trim() !== "" && mongoose.Types.ObjectId.isValid(classId)) {
                userData.classId = classId;
            }
            // If classId is empty or invalid, it's omitted (optional field)
        } else if (role === 'teacher') {
            userData.department = department;
        }

        const user = new User(userData);
        await user.save();

        // ✅ AFTER (fixed)
        const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });


        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: user.toJSON()
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: error.message });
    }
});
// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user
        const user = await User.findOne({ email, isActive: true })
            .populate('classId', 'name branch year')
            .populate('subjects', 'name code');

        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // ✅ FIXED: include role in token
        const token = jwt.sign(
            { id: user._id, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: user.toJSON()
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Get current user
router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate('classId', 'name branch year')
            .populate('subjects', 'name code');

        res.json({ user: user.toJSON() });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update profile
router.put('/profile', auth, upload.single('profileImage'), async (req, res) => {
    try {
        const updates = req.body;

        if (req.file) {
            updates.profileImage = `/uploads/profiles/${req.file.filename}`;
        }

        const user = await User.findByIdAndUpdate(
            req.user._id,
            updates,
            { new: true, runValidators: true }
        ).populate('classId', 'name branch year')
            .populate('subjects', 'name code');

        res.json({
            message: 'Profile updated successfully',
            user: user.toJSON()
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
