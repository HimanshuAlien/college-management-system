const express = require('express');
const mongoose = require('mongoose'); // ← ADD THIS LINE
const User = require('../models/User');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const Assignment = require('../models/Assignment');
const Attendance = require('../models/Attendance');
const { auth, authorize } = require('../middleware/auth');
const Announcement = require('../models/announcements');
const multer = require('multer');
const Message = require('../models/Message'); // Make sure you have this model
const router = express.Router();

// Apply middleware
router.use(auth);
router.use(authorize(['admin']));
// Add this near the top of admin.js and teacher.js (after other imports)
const profileUpload = multer({
    dest: 'backend/uploads/profiles/',
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files allowed!'), false);
        }
    }
});

// Dashboard statistics
router.get('/dashboard', async (req, res) => {
    try {
        const totalStudents = await User.countDocuments({ role: 'student', isActive: true });
        const totalTeachers = await User.countDocuments({ role: 'teacher', isActive: true });
        const totalClasses = await Class.countDocuments({ isActive: true });
        const totalSubjects = await Subject.countDocuments({ isActive: true });

        // Recent registrations
        const recentUsers = await User.find({ isActive: true })
            .select('name email role createdAt')
            .sort({ createdAt: -1 })
            .limit(10);

        // Class-wise student count
        const classStats = await Class.aggregate([
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: 'classId',
                    as: 'students'
                }
            },
            {
                $project: {
                    name: 1,
                    branch: 1,
                    year: 1,
                    studentCount: { $size: '$students' }
                }
            }
        ]);

        res.json({
            totalStudents,
            totalTeachers,
            totalClasses,
            totalSubjects,
            recentUsers,
            classStats
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
// Create new announcement
router.post('/announcements', async (req, res) => {
    try {
        const { title, content, status, priority, targetAudience } = req.body;
        const adminId = req.user.id;

        const announcement = new Announcement({
            title,
            content,
            author: adminId,
            status: status || 'draft',
            priority: priority || 'normal',
            targetAudience: targetAudience || ['all']
        });

        await announcement.save();

        console.log('✅ Announcement created:', announcement.title);
        res.json({
            success: true,
            message: 'Announcement created successfully',
            announcement
        });
    } catch (error) {
        console.error('❌ Create announcement error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Get all announcements for admin (published, draft, deactivated)
router.get('/announcements', async (req, res) => {
    try {
        const announcements = await Announcement.find({})
            .populate('author', 'name role')
            .sort({ createdAt: -1 });

        res.json({ announcements });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update announcement status (publish/deactivate)
router.put('/announcements/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const announcement = await Announcement.findByIdAndUpdate(
            id,
            {
                status,
                updatedAt: new Date()
            },
            { new: true }
        );

        if (!announcement) {
            return res.status(404).json({ message: 'Announcement not found' });
        }

        console.log(`✅ Announcement ${status}:`, announcement.title);
        res.json({
            success: true,
            message: `Announcement ${status} successfully`,
            announcement
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Delete announcement
router.delete('/announcements/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const announcement = await Announcement.findByIdAndDelete(id);

        if (!announcement) {
            return res.status(404).json({ message: 'Announcement not found' });
        }

        console.log('🗑️ Announcement deleted:', announcement.title);
        res.json({
            success: true,
            message: 'Announcement deleted successfully'
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
// User Management
router.get('/users', async (req, res) => {
    try {
        const { role, search, page = 1, limit = 10 } = req.query;

        let query = { isActive: true };
        if (role && role !== 'all') {
            query.role = role;
        }
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { rollNumber: { $regex: search, $options: 'i' } }
            ];
        }

        const users = await User.find(query)
            .populate('classId', 'name branch year')
            .populate('subjects', 'name code')
            .select('-password')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await User.countDocuments(query);

        res.json({
            users,
            pagination: {
                current: page,
                pages: Math.ceil(total / limit),
                total
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create user
// Create user
router.post('/users', async (req, res) => {
    try {
        const userData = req.body;

        // ✅ FIX: Sanitize empty classId
        if (userData.classId === "" || userData.classId === null || userData.classId === undefined) {
            delete userData.classId;
        } else if (userData.classId && !mongoose.Types.ObjectId.isValid(userData.classId)) {
            return res.status(400).json({ message: 'Invalid class ID provided' });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email: userData.email });
        if (existingUser) {
            return res.status(400).json({ message: 'Email already exists' });
        }

        const user = new User(userData);
        await user.save();

        // Update class student count if student
        if (userData.role === 'student' && userData.classId) {
            await Class.findByIdAndUpdate(userData.classId, {
                $inc: { totalStudents: 1 }
            });
        }

        await user.populate('classId', 'name branch year');
        res.status(201).json({
            message: 'User created successfully',
            user: user.toJSON()
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


// Update user
router.put('/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const updates = req.body;

        const oldUser = await User.findById(userId);
        if (!oldUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = await User.findByIdAndUpdate(userId, updates, {
            new: true,
            runValidators: true
        }).populate('classId', 'name branch year')
            .populate('subjects', 'name code');

        // Update class counts if student class changed
        if (oldUser.role === 'student' && oldUser.classId && updates.classId) {
            if (oldUser.classId.toString() !== updates.classId.toString()) {
                await Class.findByIdAndUpdate(oldUser.classId, { $inc: { totalStudents: -1 } });
                await Class.findByIdAndUpdate(updates.classId, { $inc: { totalStudents: 1 } });
            }
        }

        res.json({
            message: 'User updated successfully',
            user: user.toJSON()
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Delete user (soft delete)
router.delete('/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;

        const user = await User.findByIdAndUpdate(userId, { isActive: false }, { new: true });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Update class student count if student
        if (user.role === 'student' && user.classId) {
            await Class.findByIdAndUpdate(user.classId, {
                $inc: { totalStudents: -1 }
            });
        }

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
// Add this route - it will fix ALL subjects with undefined teacher field
router.post('/force-fix-subjects', async (req, res) => {
    try {
        console.log('🔧 FORCE-FIXING all subject-teacher assignments...');

        // Step 1: Get ALL subjects with undefined or null teacher field
        const brokenSubjects = await Subject.find({
            $or: [
                { teacher: { $exists: false } },
                { teacher: null },
                { teacher: undefined }
            ]
        });

        console.log(`📚 Found ${brokenSubjects.length} subjects with missing teacher field`);

        // Step 2: For each broken subject, find which teacher has it in their subjects array
        let fixedCount = 0;

        for (const subject of brokenSubjects) {
            // Find teacher who has this subject in their subjects array
            const teacher = await User.findOne({
                role: 'teacher',
                subjects: subject._id
            });

            if (teacher) {
                // Force update the subject's teacher field
                await Subject.findByIdAndUpdate(subject._id, {
                    $set: { teacher: teacher._id }
                });

                console.log(`✅ Fixed: ${subject.name} → ${teacher.name}`);
                fixedCount++;
            } else {
                console.log(`❌ No teacher found for subject: ${subject.name}`);
            }
        }

        console.log(`🎉 FORCE-FIX COMPLETE! Fixed ${fixedCount} subjects.`);
        res.json({
            message: `Force-fixed ${fixedCount} out of ${brokenSubjects.length} broken subjects`,
            success: true
        });

    } catch (error) {
        console.error('❌ Force-fix error:', error.message);
        res.status(500).json({ message: error.message });
    }
});
// Universal search route - ADD TO ALL 3 FILES
router.get('/search-users', async (req, res) => {
    try {
        const { query } = req.query;
        console.log('🔍 Search query received:', query); // Debug line

        if (!query || query.length < 2) {
            return res.json({ users: [] });
        }

        const users = await User.find({
            $or: [
                { name: { $regex: query, $options: 'i' } },
                { email: { $regex: query, $options: 'i' } }
            ],
            role: { $in: ['student', 'teacher', 'admin'] }
        })
            .select('name email role')
            .limit(10);

        console.log('👥 Found users:', users.length); // Debug line
        res.json({ users });
    } catch (error) {
        console.error('❌ Search error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Messages (same as student but with teacher authorization)
router.get('/messages', async (req, res) => {
    try {
        const userId = req.user.id;

        const messages = await Message.find({
            $or: [{ sender: userId }, { receiver: userId }]
        }).populate('sender receiver', 'name role profileImage')
            .sort({ createdAt: -1 });

        const conversations = {};

        messages.forEach(message => {
            const partnerId = message.sender._id.toString() === userId.toString() ?
                message.receiver._id.toString() : message.sender._id.toString();

            if (!conversations[partnerId]) {
                conversations[partnerId] = {
                    partner: message.sender._id.toString() === userId.toString() ?
                        message.receiver : message.sender,
                    messages: [],
                    unreadCount: 0,
                    lastMessage: message
                };
            }

            conversations[partnerId].messages.push(message);

            if (message.receiver._id.toString() === userId.toString() && !message.isRead) {
                conversations[partnerId].unreadCount++;
            }
        });

        res.json({ conversations: Object.values(conversations) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.post('/messages', async (req, res) => {
    try {
        const { receiverId, content } = req.body;
        const senderId = req.user.id;

        const message = new Message({
            sender: senderId,
            receiver: receiverId,
            content
        });

        await message.save();
        await message.populate('sender receiver', 'name role profileImage');

        res.json({ message, success: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


// Class Management
router.get('/classes', async (req, res) => {
    try {
        const classes = await Class.find({ isActive: true })
            .populate('classTeacher', 'name email')
            .populate('subjects', 'name code')
            .sort({ branch: 1, year: 1, section: 1 });

        // Get student count for each class
        const classesWithCount = await Promise.all(
            classes.map(async (cls) => {
                const studentCount = await User.countDocuments({
                    classId: cls._id,
                    role: 'student',
                    isActive: true
                });
                return { ...cls.toObject(), studentCount };
            })
        );

        res.json({ classes: classesWithCount });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create class
router.post('/classes', async (req, res) => {
    try {
        const classData = req.body;

        // Check if class already exists
        const existingClass = await Class.findOne({
            branch: classData.branch,
            year: classData.year,
            section: classData.section
        });

        if (existingClass) {
            return res.status(400).json({ message: 'Class already exists' });
        }

        const newClass = new Class(classData);
        await newClass.save();
        await newClass.populate('classTeacher', 'name email');

        res.status(201).json({
            message: 'Class created successfully',
            class: newClass
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update class
router.put('/classes/:id', async (req, res) => {
    try {
        const classId = req.params.id;
        const updates = req.body;

        const updatedClass = await Class.findByIdAndUpdate(classId, updates, {
            new: true,
            runValidators: true
        }).populate('classTeacher', 'name email')
            .populate('subjects', 'name code');

        if (!updatedClass) {
            return res.status(404).json({ message: 'Class not found' });
        }

        res.json({
            message: 'Class updated successfully',
            class: updatedClass
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Delete class
router.delete('/classes/:id', async (req, res) => {
    try {
        const classId = req.params.id;

        // Check if class has students
        const studentCount = await User.countDocuments({
            classId: classId,
            role: 'student',
            isActive: true
        });

        if (studentCount > 0) {
            return res.status(400).json({
                message: `Cannot delete class with ${studentCount} active students`
            });
        }

        await Class.findByIdAndUpdate(classId, { isActive: false });
        res.json({ message: 'Class deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Subject Management
router.get('/subjects', async (req, res) => {
    try {
        const { classId } = req.query;

        let query = { isActive: true };
        if (classId) {
            query.class = classId;
        }

        const subjects = await Subject.find(query)
            .populate('teacher', 'name email department')
            .populate('class', 'name branch year section')
            .sort({ name: 1 });

        res.json({ subjects });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create subject
router.post('/subjects', async (req, res) => {
    try {
        const subjectData = req.body;

        // Validate required fields
        if (!subjectData.name || !subjectData.code || !subjectData.credits || !subjectData.class) {
            return res.status(400).json({ message: 'Name, code, credits, and class are required' });
        }

        // Sanitize ObjectId fields
        if (subjectData.teacher === "" || subjectData.teacher === null || subjectData.teacher === undefined) {
            delete subjectData.teacher;
        } else if (subjectData.teacher && !mongoose.Types.ObjectId.isValid(subjectData.teacher)) {
            return res.status(400).json({ message: 'Invalid teacher ID' });
        }

        if (!mongoose.Types.ObjectId.isValid(subjectData.class)) {
            return res.status(400).json({ message: 'Invalid class ID' });
        }

        // Check if subject code already exists
        const existingSubject = await Subject.findOne({
            code: subjectData.code.toUpperCase()
        });

        if (existingSubject) {
            return res.status(400).json({ message: 'Subject code already exists' });
        }

        // Create subject with all data
        const subject = new Subject({
            name: subjectData.name,
            code: subjectData.code.toUpperCase(),
            credits: parseInt(subjectData.credits), // Ensure it's a number
            class: subjectData.class,
            teacher: subjectData.teacher || undefined,
            description: subjectData.description || ''
        });

        await subject.save();

        // Add subject to class
        await Class.findByIdAndUpdate(subjectData.class, {
            $push: { subjects: subject._id }
        });

        // Add subject to teacher if assigned
        if (subjectData.teacher) {
            await User.findByIdAndUpdate(subjectData.teacher, {
                $push: { subjects: subject._id }
            });
        }

        // Fetch populated subject
        const populatedSubject = await Subject.findById(subject._id)
            .populate('teacher', 'name email department')
            .populate('class', 'name branch year section');

        res.status(201).json({
            message: 'Subject created successfully',
            subject: populatedSubject
        });
    } catch (error) {
        console.error('Subject creation error:', error);
        res.status(500).json({ message: error.message });
    }
});



// Update subject
router.put('/subjects/:id', async (req, res) => {
    try {
        const subjectId = req.params.id;
        const updates = req.body;

        const oldSubject = await Subject.findById(subjectId);
        if (!oldSubject) {
            return res.status(404).json({ message: 'Subject not found' });
        }

        const subject = await Subject.findByIdAndUpdate(subjectId, updates, {
            new: true,
            runValidators: true
        }).populate('teacher', 'name email')
            .populate('class', 'name branch year');

        // Update teacher assignment if changed
        if (updates.teacher && oldSubject.teacher.toString() !== updates.teacher) {
            // Remove from old teacher
            await User.findByIdAndUpdate(oldSubject.teacher, {
                $pull: { subjects: subjectId }
            });
            // Add to new teacher
            await User.findByIdAndUpdate(updates.teacher, {
                $push: { subjects: subjectId }
            });
        }

        res.json({
            message: 'Subject updated successfully',
            subject
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get teachers for dropdown
router.get('/teachers', async (req, res) => {
    try {
        const teachers = await User.find({
            role: 'teacher',
            isActive: true
        }).select('name email department').sort({ name: 1 });

        res.json({ teachers });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// System reports
router.get('/reports/attendance', async (req, res) => {
    try {
        const { startDate, endDate, classId } = req.query;

        let matchQuery = {};
        if (startDate && endDate) {
            matchQuery.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const attendanceReport = await Attendance.aggregate([
            { $match: matchQuery },
            {
                $lookup: {
                    from: 'users',
                    localField: 'student',
                    foreignField: '_id',
                    as: 'studentInfo'
                }
            },
            {
                $lookup: {
                    from: 'subjects',
                    localField: 'subject',
                    foreignField: '_id',
                    as: 'subjectInfo'
                }
            },
            {
                $unwind: '$studentInfo'
            },
            {
                $unwind: '$subjectInfo'
            },
            {
                $group: {
                    _id: '$student',
                    studentName: { $first: '$studentInfo.name' },
                    rollNumber: { $first: '$studentInfo.rollNumber' },
                    totalClasses: { $sum: 1 },
                    presentClasses: {
                        $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] }
                    }
                }
            },
            {
                $project: {
                    studentName: 1,
                    rollNumber: 1,
                    totalClasses: 1,
                    presentClasses: 1,
                    attendancePercentage: {
                        $round: [
                            { $multiply: [{ $divide: ['$presentClasses', '$totalClasses'] }, 100] },
                            2
                        ]
                    }
                }
            },
            { $sort: { attendancePercentage: -1 } }
        ]);

        res.json({ attendanceReport });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
// ✅ POST route to upload profile picture
router.post('/profile/picture', profileUpload.single('profilePic'), async (req, res) => {
    try {
        const userId = req.user.id;
        const profileImage = `/uploads/profiles/${req.file.filename}`;

        // Update user's profile image in database
        await User.findByIdAndUpdate(userId, { profileImage });

        res.json({
            success: true,
            profileImage,
            message: 'Profile picture updated successfully'
        });
    } catch (error) {
        console.error('Profile upload error:', error);
        res.status(500).json({ message: error.message });
    }
});

// ✅ GET route to fetch current user profile
router.get('/profile', async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ user });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ message: error.message });
    }
});

// ✅ PUT route to update user profile info
router.put('/profile', async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, email, phone } = req.body;

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { name, email, phone },
            { new: true }
        ).select('-password');

        res.json({
            success: true,
            user: updatedUser,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ message: error.message });
    }
});



module.exports = router;
